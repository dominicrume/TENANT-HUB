import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { DbClient, Queryable } from "@tenant-hub/db";
import { ownerDigest } from "../src/agents/owner-digest";
import type { AgentContext } from "../src/registry";

const root = (() => { let d = path.resolve(__dirname); while (!fs.existsSync(path.join(d, "pnpm-workspace.yaml"))) d = path.dirname(d); return d; })();
const migration = (f: string) => fs.readFileSync(path.join(root, "supabase/migrations", f), "utf-8").replace(/NOTIFY pgrst[^;]*;/g, "");

const PREREQ = `
CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE auth.fake_uid (uid uuid);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT uid FROM auth.fake_uid LIMIT 1 $$ LANGUAGE sql STABLE;
CREATE TYPE user_role AS ENUM ('manager','support_worker','tenant','admin');
CREATE TYPE brand AS ENUM ('mattys_place','ash_shahada','reliance');
CREATE TYPE audit_action AS ENUM ('CREATE','UPDATE','DELETE','VERIFY','SIGN','EXPORT','LOGIN');
CREATE TABLE organisations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE profiles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, role user_role NOT NULL DEFAULT 'support_worker', tenant_id UUID, email TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE tenants (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, full_name TEXT, address TEXT, postcode TEXT, room_number TEXT, moved_in DATE, created_by UUID,
  brand brand DEFAULT 'mattys_place', is_active BOOLEAN DEFAULT TRUE, is_archived BOOLEAN DEFAULT FALSE, housing_benefit_status TEXT, hb_claim_date DATE, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE settings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), brand brand UNIQUE, service_charge_default NUMERIC(10,2) DEFAULT 150);
CREATE TABLE service_charges (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, week_label TEXT NOT NULL DEFAULT 'Week', due_date DATE NOT NULL, amount NUMERIC(10,2) NOT NULL, is_paid BOOLEAN DEFAULT FALSE);
CREATE TABLE rent_payments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, amount NUMERIC(10,2), payment_date DATE DEFAULT CURRENT_DATE);
CREATE TABLE audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, action audit_action NOT NULL, table_name TEXT NOT NULL, record_id UUID,
  user_id UUID, user_name TEXT, user_role TEXT, entry_method TEXT, prev_hash TEXT NOT NULL, blockchain_hash TEXT NOT NULL, record_snapshot JSONB, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE stamp_queue (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, audit_hash TEXT NOT NULL, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE sessions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, notes TEXT);
CREATE TABLE staff_notes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, tenant_id UUID, note_content TEXT);
CREATE TABLE communications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, tenant_id UUID, content TEXT);
CREATE TABLE maintenance_tickets (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL, tenant_id UUID, room_number TEXT, issue_type TEXT, description TEXT, status TEXT DEFAULT 'Open', reported_by TEXT, assigned_to TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE drafts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), created_by UUID NOT NULL, machine_state JSONB NOT NULL DEFAULT '{}', step INTEGER NOT NULL DEFAULT 1, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE shift_handovers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL, shift_date DATE NOT NULL DEFAULT CURRENT_DATE, shift_type TEXT NOT NULL DEFAULT 'Morning', notes TEXT NOT NULL DEFAULT '', staff_name TEXT NOT NULL DEFAULT 'Staff', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION get_my_org_id() RETURNS UUID AS $$ SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1; $$ LANGUAGE sql STABLE SECURITY DEFINER;
CREATE OR REPLACE FUNCTION get_my_role() RETURNS user_role AS $$ SELECT role FROM profiles WHERE id = auth.uid(); $$ LANGUAGE sql STABLE SECURITY DEFINER;
`;
// Tables 032 references that this scenario does not otherwise need, stubbed empty.
const REST = ["intake_checklists(id UUID, tenant_id UUID)", "form_templates(id UUID, org_id UUID)",
  "tenant_forms(id UUID, tenant_id UUID)", "tenant_documents(id UUID, tenant_id UUID)", "incident_reports(id UUID, org_id UUID)",
  "communications_log(id UUID, org_id UUID)", "tenant_goals(id UUID, tenant_id UUID)", "tenant_goal_updates(id UUID, goal_id UUID)", "agent_health(agent TEXT)"];

async function pgliteClient(): Promise<DbClient & { raw: PGlite }> {
  const pg = new PGlite(); await pg.waitReady;
  const wrap = (q: { query: PGlite["query"] }): Queryable => ({
    async query<T>(sql: string, params?: unknown[]) { const r = await q.query<T>(sql, params as unknown[]); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }; },
  });
  return { ...wrap(pg), transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))), end: () => pg.close(), raw: pg };
}

describe("owner-digest", () => {
  let db: Awaited<ReturnType<typeof pgliteClient>>;
  let org: string, ctx: AgentContext;

  beforeAll(async () => {
    db = await pgliteClient();
    await db.raw.exec(PREREQ + REST.map((t) => `CREATE TABLE ${t};`).join("\n"));
    for (const m of ["031_agent_runtime.sql", "032_rls_request_settings.sql", "033_property_spine.sql", "034_money_and_arrears.sql"]) {
      await db.raw.exec(migration(m));
    }
    org = (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ('Matty''s Place') RETURNING id")).rows[0]!.id;
    await db.query("INSERT INTO profiles (org_id, role, email) VALUES ($1, 'manager', 'manager@example.com')", [org]);
    ctx = { client: db, orgId: org, correlationId: "cid-1", payload: {} };
  });
  afterAll(async () => { await db.end(); });

  const latestDigest = async () =>
    (await db.query<{ id: string; title: string; body: string; is_simulated: boolean }>(
      "SELECT id, title, body, is_simulated FROM documents WHERE org_id = $1 AND kind = 'digest' ORDER BY created_at DESC LIMIT 1", [org])).rows[0];

  it("writes a digest document listing nothing when the organisation has no tenants at all", async () => {
    // buildNeedsYou's handover nudge is genuinely time-of-day dependent (it fires
    // after midday regardless of tenant data), so this checks for the absence of
    // any TENANT-related concern rather than asserting the whole body is empty —
    // otherwise this test would flake depending on when it happens to run.
    const empty = (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ('Empty Org') RETURNING id")).rows[0]!.id;
    await db.query("INSERT INTO profiles (org_id, role, email) VALUES ($1, 'manager', 'empty-manager@example.com')", [empty]);
    await ownerDigest({ client: db, orgId: empty, correlationId: "cid-empty", payload: {} });
    const doc = (await db.query<{ body: string }>("SELECT body FROM documents WHERE org_id = $1 AND kind = 'digest' ORDER BY created_at DESC LIMIT 1", [empty])).rows[0];
    expect(doc!.body).not.toMatch(/repair|housing benefit|weeks behind|signature/i);
  });

  it("lists an unassigned repair and a suspended housing benefit tenant, grouped the same way Today groups them", async () => {
    const tenant = (await db.query<{ id: string }>(
      "INSERT INTO tenants (org_id, full_name, room_number, housing_benefit_status) VALUES ($1, 'Amina Khan', '4', 'suspended') RETURNING id", [org])).rows[0]!.id;
    await db.query("INSERT INTO maintenance_tickets (org_id, tenant_id, room_number, issue_type, status, reported_by) VALUES ($1, $2, '4', 'Plumbing', 'Open', 'Amina')", [org, tenant]);

    await ownerDigest({ ...ctx, correlationId: "cid-a" });

    const doc = await latestDigest();
    expect(doc!.title).toMatch(/^Morning summary/);
    expect(doc!.body).toMatch(/Repairs/);
    expect(doc!.body).toMatch(/Plumbing repair waiting · Room 4/);
    expect(doc!.body).toMatch(/Housing benefit/);
    expect(doc!.body).toMatch(/Housing benefit suspended: Amina Khan, Room 4/);
  });

  it("is badged simulated — no live notify adapter is keyed in this environment", async () => {
    const doc = await latestDigest();
    expect(doc!.is_simulated).toBe(true);
  });

  it("records the no-human-actor receipt", async () => {
    const logs = (await db.query<{ user_id: string | null; agent: string | null }>(
      "SELECT user_id, agent FROM audit_logs WHERE table_name = 'documents' ORDER BY created_at DESC LIMIT 1")).rows;
    expect(logs[0]).toMatchObject({ user_id: null, agent: "owner-digest" });
  });
});
