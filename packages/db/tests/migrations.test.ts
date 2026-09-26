import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createPgliteClient } from "./pglite";

/**
 * Applies the new migrations to a real Postgres in-process, on top of a stub of
 * the Supabase-specific surface (auth.uid(), the RLS helper functions, the
 * tables the migrations reference). Proves the SQL is valid and the indexes
 * behave, before it ever touches a hosted database.
 */
const root = (() => { let d = path.resolve(__dirname); while (!fs.existsSync(path.join(d, "pnpm-workspace.yaml"))) d = path.dirname(d); return d; })();
const migration = (file: string) => fs.readFileSync(path.join(root, "supabase/migrations", file), "utf-8").replace(/NOTIFY pgrst[^;]*;/g, "");

const PREREQ = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT NULL::uuid $$ LANGUAGE sql STABLE;
CREATE TYPE user_role AS ENUM ('manager','support_worker','tenant','admin');
CREATE TYPE audit_action AS ENUM ('CREATE','UPDATE','DELETE','VERIFY','SIGN','EXPORT','LOGIN');
CREATE TABLE organisations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL);
CREATE TABLE profiles (id UUID PRIMARY KEY, org_id UUID REFERENCES organisations(id), role user_role NOT NULL DEFAULT 'support_worker');
CREATE TABLE audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, action audit_action NOT NULL, table_name TEXT NOT NULL,
  record_id UUID, user_id UUID, user_name TEXT, user_role TEXT, entry_method TEXT, prev_hash TEXT NOT NULL, blockchain_hash TEXT NOT NULL,
  record_snapshot JSONB, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE OR REPLACE FUNCTION get_my_org_id() RETURNS UUID AS $$ SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1; $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION get_my_role() RETURNS user_role AS $$ SELECT role FROM profiles WHERE id = auth.uid(); $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
`;

describe("031_agent_runtime.sql", () => {
  let db: Awaited<ReturnType<typeof createPgliteClient>>;
  let org: string;
  beforeAll(async () => {
    db = await createPgliteClient();
    await db.raw.exec(PREREQ);
    await db.raw.exec(migration("031_agent_runtime.sql"));
    org = (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ('Test HA') RETURNING id")).rows[0]!.id;
  });
  afterAll(async () => { await db.end(); });

  it("is idempotent — applying it twice is a no-op", async () => {
    await expect(db.raw.exec(migration("031_agent_runtime.sql"))).resolves.not.toThrow();
  });

  it("creates jobs, agent_health, agent_telemetry and the receipt columns on audit_logs", async () => {
    const tables = (await db.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1")).rows.map((r) => r.table_name);
    expect(tables).toEqual(expect.arrayContaining(["jobs", "agent_health", "agent_telemetry"]));
    const cols = (await db.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name='audit_logs'")).rows.map((r) => r.column_name);
    expect(cols).toEqual(expect.arrayContaining(["org_id", "agent", "sources_read", "refusals", "outcome", "correlation_id", "payload"]));
  });

  it("refuses to queue the same dedupe_key twice while a job is live, and allows it once the job is done", async () => {
    const ins = (k: string) => db.query("INSERT INTO jobs (org_id, job_type, dedupe_key) VALUES ($1, 'compliance-watch', $2) RETURNING id", [org, k]);
    const first = await ins("compliance-watch:1");
    await expect(ins("compliance-watch:1")).rejects.toThrow();
    await db.query("UPDATE jobs SET status='done', finished_at=NOW() WHERE id=$1", [first.rows[0]!.id]);
    await expect(ins("compliance-watch:1")).resolves.toBeTruthy();
  });

  it("keeps updated_at current on jobs and rejects an unknown outcome on audit_logs", async () => {
    const j = (await db.query<{ id: string; updated_at: Date }>("INSERT INTO jobs (org_id, job_type) VALUES ($1, 'x') RETURNING id, updated_at", [org])).rows[0]!;
    await new Promise((r) => setTimeout(r, 20));
    const after = (await db.query<{ updated_at: Date }>("UPDATE jobs SET status='processing' WHERE id=$1 RETURNING updated_at", [j.id])).rows[0]!;
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(new Date(j.updated_at).getTime());
    await expect(db.query("INSERT INTO audit_logs (action, table_name, prev_hash, blockchain_hash, outcome) VALUES ('CREATE','t','0','1','maybe')")).rejects.toThrow();
  });

  it("upserts agent_health by agent name", async () => {
    await db.query("INSERT INTO agent_health (agent, last_heartbeat_at) VALUES ('rent-reconciliation', NOW()) ON CONFLICT (agent) DO UPDATE SET last_heartbeat_at = NOW()");
    await db.query("INSERT INTO agent_health (agent, last_heartbeat_at) VALUES ('rent-reconciliation', NOW()) ON CONFLICT (agent) DO UPDATE SET last_heartbeat_at = NOW()");
    expect(Number((await db.query<{ n: string | number }>("SELECT count(*) n FROM agent_health")).rows[0]!.n)).toBe(1);
  });
});
