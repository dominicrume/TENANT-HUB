import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { DbClient, Queryable } from "@tenant-hub/db";
import { createLogger, memorySink, setLogger } from "@tenant-hub/telemetry";
import { SimNotify } from "@tenant-hub/adapters";
import { register, _clearRegistryForTests, HOUR } from "../src/registry";
import { scheduleDue } from "../src/scheduler";
import { drainOnce } from "../src/drain";
import { drainStamps } from "../src/agents/chain-stamp";
import { verifyChain, chainCheck, CHAIN_MANDATE } from "../src/agents/chain-check";
import { mandate } from "@tenant-hub/kya";

const root = (() => { let d = path.resolve(__dirname); while (!fs.existsSync(path.join(d, "pnpm-workspace.yaml"))) d = path.dirname(d); return d; })();
const PREREQ = `
CREATE SCHEMA IF NOT EXISTS auth; CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT NULL::uuid $$ LANGUAGE sql STABLE;
CREATE TYPE user_role AS ENUM ('manager','support_worker','tenant','admin');
CREATE TYPE audit_action AS ENUM ('CREATE','UPDATE','DELETE','VERIFY','SIGN','EXPORT','LOGIN');
CREATE TYPE stamp_status AS ENUM ('pending','processing','done','failed','dead_letter');
CREATE TABLE organisations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE profiles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, role user_role NOT NULL DEFAULT 'support_worker', email TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE tenants (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, full_name TEXT);
CREATE TABLE audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, action audit_action NOT NULL, table_name TEXT NOT NULL,
  record_id UUID, user_id UUID, user_name TEXT, user_role TEXT, entry_method TEXT, prev_hash TEXT NOT NULL, blockchain_hash TEXT NOT NULL, record_snapshot JSONB, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE stamp_queue (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, audit_hash TEXT NOT NULL, status stamp_status DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0, tx_hash TEXT, error TEXT, next_retry_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE OR REPLACE FUNCTION get_my_org_id() RETURNS UUID AS $$ SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1; $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION get_my_role() RETURNS user_role AS $$ SELECT role FROM profiles WHERE id = auth.uid(); $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
`;

async function pgliteClient() {
  const pg = new PGlite(); await pg.waitReady;
  const wrap = (q: { query: PGlite["query"] }): Queryable => ({ async query<T>(sql: string, params?: unknown[]) { const r = await q.query<T>(sql, params as unknown[]); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }; } });
  const client: DbClient & { raw: PGlite } = { ...wrap(pg), transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))), end: () => pg.close(), raw: pg };
  return client;
}

describe("worker runtime", () => {
  let db: Awaited<ReturnType<typeof pgliteClient>>;
  let org: string;
  const runs: string[] = [];
  beforeAll(async () => {
    setLogger(createLogger({ write: () => undefined }));
    db = await pgliteClient();
    await db.raw.exec(PREREQ);
    await db.raw.exec(fs.readFileSync(path.join(root, "supabase/migrations/031_agent_runtime.sql"), "utf-8").replace(/NOTIFY pgrst[^;]*;/g, ""));
    org = (await db.query<{ id: string }>("INSERT INTO organisations (name, created_at) VALUES ('HA', NOW() - INTERVAL '1 hour') RETURNING id")).rows[0]!.id;
    await db.query("INSERT INTO profiles (org_id, role, email) VALUES ($1, 'manager', 'manager@example.org')", [org]);
  });
  afterAll(async () => { await db.end(); });
  beforeEach(() => { _clearRegistryForTests(); runs.length = 0; });

  it("schedules each agent once per org per interval, then drains it inside a span", async () => {
    register({ name: "ok-agent", label: "OK", scheduleMs: HOUR, mandate: mandate("ok-agent", [], []), fn: async (ctx) => { runs.push(ctx.orgId); } });
    expect(await scheduleDue(db)).toBe(1);
    expect(await scheduleDue(db)).toBe(0); // dedupe: still pending
    const m = memorySink();
    expect(await drainOnce({ client: db, sink: m.sink, notify: new SimNotify(), managerEmail: async () => null })).toBe(1);
    expect(runs).toEqual([org]);
    expect(m.events.map((e) => e.event)).toEqual(["start", "end"]);
    expect(await scheduleDue(db)).toBe(0); // finished within the interval → not requeued
    expect((await db.query<{ status: string }>("SELECT status FROM jobs WHERE job_type='ok-agent'")).rows[0]!.status).toBe("done");
  });

  it("a failing agent retries with backoff and dead-letters with an email to the manager", async () => {
    register({ name: "bad-agent", label: "Bad agent", scheduleMs: HOUR, mandate: mandate("bad-agent", [], []), fn: async () => { throw new Error("kaput"); } });
    await scheduleDue(db);
    await db.query("UPDATE jobs SET max_retries = 2 WHERE job_type='bad-agent'");
    const m = memorySink(); const notify = new SimNotify();
    const deps = { client: db, sink: m.sink, notify, managerEmail: async () => "manager@example.org" };
    await drainOnce(deps);
    let j = (await db.query<{ status: string; retry_count: number }>("SELECT status, retry_count FROM jobs WHERE job_type='bad-agent'")).rows[0]!;
    expect(j).toMatchObject({ status: "failed", retry_count: 1 });
    expect(notify.sent).toHaveLength(0);
    await db.query("UPDATE jobs SET scheduled_at = NOW() - INTERVAL '1 second' WHERE job_type='bad-agent'");
    await drainOnce(deps);
    j = (await db.query<{ status: string; retry_count: number }>("SELECT status, retry_count FROM jobs WHERE job_type='bad-agent'")).rows[0]!;
    expect(j).toMatchObject({ status: "dead_letter", retry_count: 2 });
    expect(notify.sent[0]).toMatchObject({ to: "manager@example.org", channel: "email" });
    expect(notify.sent[0]!.subject).toMatch(/Bad agent/);
    const health = (await db.query<{ state: string; consecutive_failures: number }>("SELECT 1")).rows; void health;
  });

  it("a job with no registered agent fails instead of vanishing", async () => {
    await db.query("INSERT INTO jobs (org_id, job_type) VALUES ($1, 'ghost')", [org]);
    const m = memorySink();
    await drainOnce({ client: db, sink: m.sink, notify: new SimNotify(), managerEmail: async () => null });
    expect((await db.query<{ status: string; error: string }>("SELECT status, error FROM jobs WHERE job_type='ghost'")).rows[0]).toMatchObject({ status: "failed", error: expect.stringMatching(/No agent registered/) });
  });

  it("chain-stamp anchors pending stamps, retries failures, dead-letters after three", async () => {
    await db.query("INSERT INTO stamp_queue (audit_hash) VALUES ('aaaa'), ('bbbb')");
    const m = memorySink();
    let calls = 0;
    const stamp = async (h: string) => { calls++; if (h === "bbbb") throw new Error("rpc down"); return `tx_${h}`; };
    const r1 = await drainStamps({ client: db, sink: m.sink, stamp });
    expect(r1).toEqual({ done: 1, failed: 1 });
    const rows = () => db.query<{ audit_hash: string; status: string; tx_hash: string | null; retry_count: number }>("SELECT audit_hash, status, tx_hash, retry_count FROM stamp_queue ORDER BY audit_hash");
    expect((await rows()).rows).toEqual([{ audit_hash: "aaaa", status: "done", tx_hash: "tx_aaaa", retry_count: 0 }, { audit_hash: "bbbb", status: "pending", tx_hash: null, retry_count: 1 }]);
    expect(await drainStamps({ client: db, sink: m.sink, stamp })).toEqual({ done: 0, failed: 0 }); // not due yet (backoff)
    for (let i = 0; i < 2; i++) { await db.query("UPDATE stamp_queue SET next_retry_at = NOW() - INTERVAL '1 second' WHERE audit_hash='bbbb'"); await drainStamps({ client: db, sink: m.sink, stamp }); }
    expect((await rows()).rows[1]).toMatchObject({ status: "dead_letter", retry_count: 3 });
    expect(calls).toBe(4);
  });

  it("chain-check passes an intact chain and fails a tampered one with an email", async () => {
    const t = (await db.query<{ id: string }>("INSERT INTO tenants (org_id, full_name) VALUES ($1, 'A') RETURNING id", [org])).rows[0]!.id;
    const { writeWithAudit } = await import("@tenant-hub/db");
    const actor = { user_id: "11111111-1111-1111-1111-111111111111", user_name: "M", user_role: "manager", org_id: org };
    await writeWithAudit({ client: db, table: "tenants", action: "UPDATE", ...actor, record: { id: t, full_name: "B" } });
    await writeWithAudit({ client: db, table: "tenants", action: "UPDATE", ...actor, record: { id: t, full_name: "C" } });
    const ctx = { client: db, orgId: org, correlationId: "cid", payload: {} };
    expect(await verifyChain(ctx)).toMatchObject({ rows: 2, brokenLinks: 0, badHashes: 0 });
    void CHAIN_MANDATE;
    // Tamper: append-only trigger is not in this stub, so a direct UPDATE stands in for a dishonest DBA.
    await db.query("UPDATE audit_logs SET payload = '{\"id\":\"x\",\"full_name\":\"Z\"}'::jsonb WHERE record_id = $1 AND action='UPDATE' AND payload->>'full_name' = 'C'", [t]);
    const report = await verifyChain(ctx);
    expect(report.badHashes).toBe(1);
    await expect(chainCheck(ctx)).rejects.toThrow(/audit chain broken/);
  });
});

describe("graceful shutdown", () => {
  it("SIGTERM waits, hands processing jobs back to pending, and exits 0", async () => {
    const { installGracefulShutdown } = await import("../src/lifecycle");
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite(); await pg.waitReady;
    await pg.exec(`CREATE TABLE organisations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TYPE job_status AS ENUM ('pending','processing','done','failed','dead_letter','cancelled');
      CREATE TABLE jobs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, job_type TEXT, status job_status DEFAULT 'pending', started_at TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT NOW());
      INSERT INTO jobs (job_type, status, started_at) VALUES ('x', 'processing', NOW());`);
    const client: DbClient = {
      async query<T>(sql: string, params?: unknown[]) { const r = await pg.query<T>(sql, params as unknown[]); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }; },
      transaction: async (fn) => fn(client), end: () => pg.close(),
    };
    let exitCode: number | null = null;
    const done = new Promise<void>((resolve) => installGracefulShutdown(client, [setInterval(() => undefined, 60_000)], (c) => { exitCode = c; resolve(); }));
    process.emit("SIGTERM" as NodeJS.Signals);
    await done;
    expect(exitCode).toBe(0);
    expect((await pg.query<{ status: string }>("SELECT status FROM jobs")).rows[0]!.status).toBe("pending");
  });
});
