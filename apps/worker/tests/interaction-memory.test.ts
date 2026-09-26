import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { DbClient, Queryable } from "@tenant-hub/db";
import { interactionMemory } from "../src/agents/interaction-memory";
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
CREATE TABLE profiles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, role user_role NOT NULL DEFAULT 'support_worker', tenant_id UUID, email TEXT);
CREATE TABLE tenants (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, full_name TEXT, address TEXT, postcode TEXT, room_number TEXT, moved_in DATE, created_by UUID,
  brand brand DEFAULT 'mattys_place', is_active BOOLEAN DEFAULT TRUE, is_archived BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE settings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), brand brand UNIQUE, service_charge_default NUMERIC(10,2) DEFAULT 150);
CREATE TABLE audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, action audit_action NOT NULL, table_name TEXT NOT NULL, record_id UUID,
  user_id UUID, user_name TEXT, user_role TEXT, entry_method TEXT, prev_hash TEXT NOT NULL, blockchain_hash TEXT NOT NULL, record_snapshot JSONB, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE stamp_queue (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, audit_hash TEXT NOT NULL, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE sessions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, notes TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE service_charges (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, due_date DATE, amount NUMERIC(10,2));
CREATE TABLE rent_payments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, amount NUMERIC(10,2), payment_date DATE DEFAULT CURRENT_DATE);
CREATE TABLE staff_notes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, tenant_id UUID, author_name TEXT, note_content TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE communications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, tenant_id UUID, channel TEXT, message_type TEXT, content TEXT, sent_by TEXT, sent_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE maintenance_tickets (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL, tenant_id UUID, room_number TEXT, issue_type TEXT, description TEXT, status TEXT DEFAULT 'Open', reported_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION get_my_org_id() RETURNS UUID AS $$ SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1; $$ LANGUAGE sql STABLE SECURITY DEFINER;
CREATE OR REPLACE FUNCTION get_my_role() RETURNS user_role AS $$ SELECT role FROM profiles WHERE id = auth.uid(); $$ LANGUAGE sql STABLE SECURITY DEFINER;
`;
// Tables 032 references that this scenario does not otherwise need, stubbed empty.
const REST = ["intake_checklists(id UUID, tenant_id UUID)", "drafts(id UUID, created_by UUID)", "form_templates(id UUID, org_id UUID)",
  "tenant_forms(id UUID, tenant_id UUID)", "tenant_documents(id UUID, tenant_id UUID)", "incident_reports(id UUID, org_id UUID)", "shift_handovers(id UUID, org_id UUID)",
  "communications_log(id UUID, org_id UUID)", "tenant_goals(id UUID, tenant_id UUID)", "tenant_goal_updates(id UUID, goal_id UUID)", "agent_health(agent TEXT)"];

async function pgliteClient(): Promise<DbClient & { raw: PGlite }> {
  const pg = new PGlite(); await pg.waitReady;
  const wrap = (q: { query: PGlite["query"] }): Queryable => ({
    async query<T>(sql: string, params?: unknown[]) { const r = await q.query<T>(sql, params as unknown[]); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }; },
  });
  return { ...wrap(pg), transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))), end: () => pg.close(), raw: pg };
}

describe("interaction-memory", () => {
  let db: Awaited<ReturnType<typeof pgliteClient>>;
  let org: string, ctx: AgentContext;

  beforeAll(async () => {
    db = await pgliteClient();
    await db.raw.exec(PREREQ + REST.map((t) => `CREATE TABLE ${t};`).join("\n"));
    for (const m of ["031_agent_runtime.sql", "032_rls_request_settings.sql", "037_commitments.sql"]) {
      await db.raw.exec(migration(m));
    }
    org = (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ('Matty''s Place') RETURNING id")).rows[0]!.id;
    ctx = { client: db, orgId: org, correlationId: "cid-1", payload: {} };
  });
  afterAll(async () => { await db.end(); });

  async function makeTenant(name: string) {
    return (await db.query<{ id: string }>("INSERT INTO tenants (org_id, full_name) VALUES ($1, $2) RETURNING id", [org, name])).rows[0]!.id;
  }
  const summaryOf = async (table: string, id: string) =>
    (await db.query<{ summary: string | null }>(`SELECT summary FROM ${table} WHERE id = $1`, [id])).rows[0]!.summary;
  const commitmentsFor = async (tenantId: string) =>
    (await db.query<{ text: string; owner: string; due_on: string | null; status: string; source_table: string }>(
      "SELECT text, owner, due_on::text AS due_on, status, source_table FROM commitments WHERE tenant_id = $1 ORDER BY created_at", [tenantId])).rows;

  it("summarises a staff note and lifts no commitment when nothing was promised", async () => {
    const tenant = await makeTenant("Ada Lovelace");
    const note = (await db.query<{ id: string }>(
      "INSERT INTO staff_notes (org_id, tenant_id, author_name, note_content) VALUES ($1, $2, 'Support Worker', 'Visited today. Flat was tidy. No concerns raised.') RETURNING id",
      [org, tenant])).rows[0]!.id;

    await interactionMemory({ ...ctx, correlationId: "cid-a" });

    expect(await summaryOf("staff_notes", note)).toBe("Visited today.");
    expect(await commitmentsFor(tenant)).toHaveLength(0);
  });

  it("lifts a promise from a staff note into its own commitment row, open, owned by the support worker", async () => {
    const tenant = await makeTenant("Grace Hopper");
    await db.query(
      "INSERT INTO staff_notes (org_id, tenant_id, author_name, note_content) VALUES ($1, $2, 'Support Worker', 'Called re rent arrears. Will chase this up with a home visit tomorrow.')",
      [org, tenant]);

    await interactionMemory({ ...ctx, correlationId: "cid-b" });

    const rows = await commitmentsFor(tenant);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ owner: "support_worker", status: "open", source_table: "staff_notes" });
    expect(rows[0]!.due_on).not.toBeNull();
  });

  it("summarises a session and a communication too, each through its own source table", async () => {
    const tenant = await makeTenant("Alan Turing");
    const session = (await db.query<{ id: string }>(
      "INSERT INTO sessions (tenant_id, notes) VALUES ($1, 'Weekly check-in went well. Tenant agreed to attend the GP appointment on Monday.') RETURNING id",
      [tenant])).rows[0]!.id;
    const comm = (await db.query<{ id: string }>(
      "INSERT INTO communications (org_id, tenant_id, channel, message_type, content, sent_by) VALUES ($1, $2, 'Email', 'General Update', 'Reminder sent about the upcoming inspection.', 'System') RETURNING id",
      [org, tenant])).rows[0]!.id;

    await interactionMemory({ ...ctx, correlationId: "cid-c" });

    expect(await summaryOf("sessions", session)).toMatch(/weekly check-in went well/i);
    expect(await summaryOf("communications", comm)).toMatch(/reminder sent/i);
    const rows = await commitmentsFor(tenant);
    expect(rows.find((r) => r.source_table === "sessions")).toMatchObject({ owner: "tenant" });
  });

  it("marks the seeded overdue promise overdue, so it shows on the tenant record", async () => {
    const tenant = await makeTenant("Overdue Tenant");
    await db.query(
      "INSERT INTO staff_notes (org_id, tenant_id, author_name, note_content) VALUES ($1, $2, 'Support Worker', 'Will submit the housing benefit form by 2020-01-01.')",
      [org, tenant]);

    await interactionMemory({ ...ctx, correlationId: "cid-d" });

    const rows = await commitmentsFor(tenant);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ due_on: "2020-01-01", status: "overdue" });
  });

  it("is idempotent: running twice never re-summarises a row or duplicates its commitment", async () => {
    const tenant = await makeTenant("Repeat Tenant");
    const note = (await db.query<{ id: string }>(
      "INSERT INTO staff_notes (org_id, tenant_id, author_name, note_content) VALUES ($1, $2, 'Support Worker', 'Will call back tomorrow to confirm.') RETURNING id",
      [org, tenant])).rows[0]!.id;

    await interactionMemory({ ...ctx, correlationId: "cid-e1" });
    const firstSummary = await summaryOf("staff_notes", note);
    const firstRows = await commitmentsFor(tenant);

    await interactionMemory({ ...ctx, correlationId: "cid-e2" });
    expect(await summaryOf("staff_notes", note)).toBe(firstSummary);
    expect(await commitmentsFor(tenant)).toHaveLength(firstRows.length);
  });

  it("records the no-human-actor receipt on every write", async () => {
    const tenant = await makeTenant("Receipt Tenant");
    await db.query(
      "INSERT INTO staff_notes (org_id, tenant_id, author_name, note_content) VALUES ($1, $2, 'Support Worker', 'Will follow up.') RETURNING id",
      [org, tenant]);

    await interactionMemory({ ...ctx, correlationId: "cid-f" });

    const logs = (await db.query<{ user_id: string | null; agent: string | null }>(
      "SELECT user_id, agent FROM audit_logs WHERE table_name = 'staff_notes' ORDER BY created_at DESC LIMIT 1")).rows;
    expect(logs[0]).toMatchObject({ user_id: null, agent: "interaction-memory" });
  });

  it("does nothing for an organisation with no interactions to summarise", async () => {
    const empty = (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ('Empty Org') RETURNING id")).rows[0]!.id;
    await expect(interactionMemory({ client: db, orgId: empty, correlationId: "cid-empty", payload: {} })).resolves.toBeUndefined();
  });
});
