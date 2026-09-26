import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { DbClient, Queryable } from "@tenant-hub/db";
import { insuranceRenewal } from "../src/agents/insurance-renewal";
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
CREATE TABLE service_charges (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, due_date DATE, amount NUMERIC(10,2));
CREATE TABLE rent_payments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, amount NUMERIC(10,2), payment_date DATE DEFAULT CURRENT_DATE);
CREATE TABLE audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, action audit_action NOT NULL, table_name TEXT NOT NULL, record_id UUID,
  user_id UUID, user_name TEXT, user_role TEXT, entry_method TEXT, prev_hash TEXT NOT NULL, blockchain_hash TEXT NOT NULL, record_snapshot JSONB, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE stamp_queue (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, audit_hash TEXT NOT NULL, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE sessions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, notes TEXT);
CREATE TABLE staff_notes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, tenant_id UUID, note_content TEXT);
CREATE TABLE communications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, tenant_id UUID, content TEXT);
CREATE TABLE maintenance_tickets (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL, tenant_id UUID, property_id UUID, room_number TEXT, issue_type TEXT, description TEXT, status TEXT DEFAULT 'Open', reported_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
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

const d = (daysFromToday: number) => { const x = new Date(); x.setUTCDate(x.getUTCDate() + daysFromToday); return x.toISOString().slice(0, 10); };

describe("insurance-renewal", () => {
  let db: Awaited<ReturnType<typeof pgliteClient>>;
  let org: string, ctx: AgentContext;

  beforeAll(async () => {
    db = await pgliteClient();
    await db.raw.exec(PREREQ + REST.map((t) => `CREATE TABLE ${t};`).join("\n"));
    for (const m of ["031_agent_runtime.sql", "032_rls_request_settings.sql", "033_property_spine.sql", "035_compliance_insurance.sql"]) {
      await db.raw.exec(migration(m));
    }
    org = (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ('Matty''s Place') RETURNING id")).rows[0]!.id;
    ctx = { client: db, orgId: org, correlationId: "cid-1", payload: {} };
  });
  afterAll(async () => { await db.end(); });

  async function makeProperty(name: string, rebuildValue = 500000) {
    return (await db.query<{ id: string }>(
      "INSERT INTO properties (org_id, name, asset_class, rebuild_value) VALUES ($1, $2, 'supported', $3) RETURNING id", [org, name, rebuildValue])).rows[0]!.id;
  }
  async function makePolicy(propertyId: string, renewalDate: string, annualPremium = 1200, leadDays = 21) {
    return (await db.query<{ id: string }>(
      "INSERT INTO insurance_policies (org_id, property_id, renewal_date, annual_premium, renewal_lead_days) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [org, propertyId, renewalDate, annualPremium, leadDays])).rows[0]!.id;
  }
  const cycleFor = async (policyId: string) =>
    (await db.query<{ id: string; status: string; best_quote_id: string | null; decision: string | null }>(
      "SELECT id, status, best_quote_id, decision FROM insurance_renewal_cycles WHERE org_id = $1 AND policy_id = $2 ORDER BY created_at DESC LIMIT 1", [org, policyId])).rows[0];
  const quotesFor = async (cycleId: string) =>
    (await db.query<{ premium: string; is_simulated: boolean }>("SELECT premium, is_simulated FROM insurance_quotes WHERE cycle_id = $1", [cycleId])).rows;

  it("does nothing for a policy renewing well outside its lead time", async () => {
    const property = await makeProperty("Far Renewal House");
    const policy = await makePolicy(property, d(90), 1200, 21);
    await insuranceRenewal({ ...ctx, correlationId: "cid-a" });
    expect(await cycleFor(policy)).toBeUndefined();
  });

  it("detects a policy inside its lead time, assembles risk, gathers quotes and stops at awaiting_decision", async () => {
    const property = await makeProperty("Renewal Due House");
    const policy = await makePolicy(property, d(10), 1200, 21);

    await insuranceRenewal({ ...ctx, correlationId: "cid-b" });

    const cycle = await cycleFor(policy);
    expect(cycle).toMatchObject({ status: "awaiting_decision", decision: null });
    expect(cycle!.best_quote_id).not.toBeNull();
    const quotes = await quotesFor(cycle!.id);
    expect(quotes.length).toBeGreaterThan(0);
    for (const q of quotes) expect(q.is_simulated).toBe(true); // no live broker endpoint keyed in this environment
  });

  it("never advances a cycle already at or past the decision card — no re-quoting on a second run", async () => {
    const property = await makeProperty("Stable House");
    const policy = await makePolicy(property, d(5));
    await insuranceRenewal({ ...ctx, correlationId: "cid-c1" });
    const first = await cycleFor(policy);
    const firstQuoteCount = (await quotesFor(first!.id)).length;

    await insuranceRenewal({ ...ctx, correlationId: "cid-c2" });
    const second = await cycleFor(policy);
    expect(second!.id).toBe(first!.id);
    expect((await quotesFor(second!.id)).length).toBe(firstQuoteCount);
  });

  it("records the bind_insurance refusal on the receipt every time a cycle reaches the decision card", async () => {
    const property = await makeProperty("Refusal House");
    const policy = await makePolicy(property, d(3));
    await insuranceRenewal({ ...ctx, correlationId: "cid-d" });

    const logs = (await db.query<{ refusals: unknown }>(
      "SELECT refusals FROM audit_logs WHERE table_name = 'insurance_renewal_cycles' AND record_id = (SELECT id FROM insurance_renewal_cycles WHERE policy_id = $1 ORDER BY created_at DESC LIMIT 1) ORDER BY created_at DESC LIMIT 1",
      [policy])).rows;
    const refusals = logs[0]!.refusals as Array<{ attempted: string }> | null;
    expect(refusals?.some((x) => x.attempted === "bind_insurance")).toBe(true);
  });

  it("never sets a cycle to 'decided' itself — that column is only ever written by the decision route", async () => {
    const property = await makeProperty("Never Decides House");
    const policy = await makePolicy(property, d(1));
    await insuranceRenewal({ ...ctx, correlationId: "cid-e" });
    const cycle = await cycleFor(policy);
    expect(cycle!.status).not.toBe("decided");
    expect(cycle!.decision).toBeNull();
  });

  it("records the no-human-actor receipt", async () => {
    const logs = (await db.query<{ user_id: string | null; agent: string | null }>(
      "SELECT user_id, agent FROM audit_logs WHERE table_name = 'insurance_quotes' ORDER BY created_at DESC LIMIT 1")).rows;
    expect(logs[0]).toMatchObject({ user_id: null, agent: "insurance-renewal" });
  });
});
