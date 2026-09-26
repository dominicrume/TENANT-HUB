import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createPgliteClient } from "./pglite";
import { enqueueJob, claimJobs, completeJob, failJob, recoverStuckJobs, releaseProcessingJobs, hasRecentJob, organisationsForAgents, deadLetterCount } from "../src/jobs";
import { createPgTelemetrySink, workerHeartbeatAge } from "../src/telemetry-sink";
import { span, setLogger, createLogger } from "@tenant-hub/telemetry";

const root = (() => { let d = path.resolve(__dirname); while (!fs.existsSync(path.join(d, "pnpm-workspace.yaml"))) d = path.dirname(d); return d; })();
const PREREQ = `
CREATE SCHEMA IF NOT EXISTS auth; CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT NULL::uuid $$ LANGUAGE sql STABLE;
CREATE TYPE user_role AS ENUM ('manager','support_worker','tenant','admin');
CREATE TYPE audit_action AS ENUM ('CREATE','UPDATE','DELETE','VERIFY','SIGN','EXPORT','LOGIN');
CREATE TABLE organisations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE profiles (id UUID PRIMARY KEY, org_id UUID, role user_role NOT NULL DEFAULT 'support_worker');
CREATE TABLE audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, action audit_action NOT NULL, table_name TEXT NOT NULL,
  record_id UUID, user_id UUID, user_name TEXT, user_role TEXT, entry_method TEXT, prev_hash TEXT NOT NULL, blockchain_hash TEXT NOT NULL, record_snapshot JSONB, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE OR REPLACE FUNCTION get_my_org_id() RETURNS UUID AS $$ SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1; $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION get_my_role() RETURNS user_role AS $$ SELECT role FROM profiles WHERE id = auth.uid(); $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
`;

describe("job queue + telemetry sink on 031", () => {
  let db: Awaited<ReturnType<typeof createPgliteClient>>;
  let org: string;
  beforeAll(async () => {
    setLogger(createLogger({ write: () => undefined }));
    db = await createPgliteClient();
    await db.raw.exec(PREREQ);
    await db.raw.exec(fs.readFileSync(path.join(root, "supabase/migrations/031_agent_runtime.sql"), "utf-8").replace(/NOTIFY pgrst[^;]*;/g, ""));
    org = (await db.query<{ id: string }>("INSERT INTO organisations (name, created_at) VALUES ('HA', NOW() - INTERVAL '1 hour') RETURNING id")).rows[0]!.id;
  });
  afterAll(async () => { await db.end(); });

  it("enqueue → claim → complete; a duplicate dedupe key is dropped while live", async () => {
    const a = await enqueueJob(db, { orgId: org, jobType: "compliance-watch", dedupeKey: "cw:1" });
    const b = await enqueueJob(db, { orgId: org, jobType: "compliance-watch", dedupeKey: "cw:1" });
    expect(a).toBeTruthy(); expect(b).toBeNull();
    const claimed = await claimJobs(db, 5);
    expect(claimed.map((j) => j.id)).toEqual([a]);
    expect(claimed[0]!.status).toBe("processing");
    expect(await claimJobs(db, 5)).toEqual([]); // nothing left to claim
    await completeJob(db, a!);
    expect((await db.query<{ status: string }>("SELECT status FROM jobs WHERE id=$1", [a])).rows[0]!.status).toBe("done");
    expect(await hasRecentJob(db, org, "compliance-watch", 60_000)).toBe(true);
    expect(await hasRecentJob(db, org, "rent-reconciliation", 60_000)).toBe(false);
  });

  it("fails with backoff, then dead-letters at max_retries", async () => {
    const id = (await enqueueJob(db, { orgId: org, jobType: "flaky", maxRetries: 2 }))!;
    const [job] = await claimJobs(db, 1);
    const first = await failJob(db, job!, "boom");
    expect(first.outcome).toBe("retry");
    expect(first.nextRetryAt!.getTime()).toBeGreaterThan(Date.now() + 60_000);
    expect(await claimJobs(db, 5)).toEqual([]); // not due yet
    await db.query("UPDATE jobs SET scheduled_at = NOW() - INTERVAL '1 second' WHERE id=$1", [id]);
    const [again] = await claimJobs(db, 1);
    expect(again!.retry_count).toBe(1);
    const second = await failJob(db, again!, "boom again");
    expect(second.outcome).toBe("dead_letter");
    expect(await deadLetterCount(db)).toBe(1);
  });

  it("recovers stuck jobs and releases processing jobs on shutdown", async () => {
    const id = (await enqueueJob(db, { orgId: org, jobType: "stuck" }))!;
    await claimJobs(db, 1);
    await db.query("UPDATE jobs SET started_at = NOW() - INTERVAL '2 hours' WHERE id=$1", [id]);
    expect(await recoverStuckJobs(db, 30)).toBe(1);
    await claimJobs(db, 1);
    expect(await releaseProcessingJobs(db)).toBe(1);
    expect((await db.query<{ status: string }>("SELECT status FROM jobs WHERE id=$1", [id])).rows[0]!.status).toBe("pending");
  });

  it("only lists organisations older than the grace period", async () => {
    await db.query("INSERT INTO organisations (name) VALUES ('brand new')");
    const orgs = await organisationsForAgents(db, 2);
    expect(orgs.map((o) => o.id)).toEqual([org]);
  });

  it("the pg sink records a span's health and events; heartbeat age is readable", async () => {
    const sink = createPgTelemetrySink(db);
    await span(sink, "chain-check", org, "cid-1", async () => "ok");
    await expect(span(sink, "chain-check", org, "cid-2", async () => { throw new Error("bad"); })).rejects.toThrow("bad");
    const h = (await db.query<{ state: string; consecutive_failures: number; last_error: string }>("SELECT state, consecutive_failures, last_error FROM agent_health WHERE agent='chain-check'")).rows[0]!;
    expect(h).toMatchObject({ state: "failed", consecutive_failures: 1, last_error: "bad" });
    const events = (await db.query<{ event: string }>("SELECT event FROM agent_telemetry WHERE agent='chain-check' ORDER BY created_at")).rows.map((r) => r.event);
    expect(events).toEqual(["start", "end", "start", "error"]);
    await sink.heartbeat("chain-check");
    const age = await workerHeartbeatAge(db);
    expect(age.agents).toBe(1);
    expect(age.ageSeconds).toBeLessThan(5);
  });
});
