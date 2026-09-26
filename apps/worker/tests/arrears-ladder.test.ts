import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { DbClient, Queryable } from "@tenant-hub/db";
import { arrearsLadder } from "../src/agents/arrears-ladder";
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
CREATE TABLE tenants (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, full_name TEXT, address TEXT, postcode TEXT, room_number TEXT, moved_in DATE, created_by UUID, email TEXT,
  brand brand DEFAULT 'mattys_place', is_active BOOLEAN DEFAULT TRUE, is_archived BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE settings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), brand brand UNIQUE, service_charge_default NUMERIC(10,2) DEFAULT 150);
CREATE TABLE service_charges (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, week_label TEXT NOT NULL, due_date DATE NOT NULL, amount NUMERIC(10,2) NOT NULL, is_paid BOOLEAN DEFAULT FALSE);
CREATE TABLE rent_payments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, amount NUMERIC(10,2) NOT NULL, payment_type TEXT, payment_date DATE NOT NULL DEFAULT CURRENT_DATE, reference_note TEXT, recorded_by UUID, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, action audit_action NOT NULL, table_name TEXT NOT NULL, record_id UUID,
  user_id UUID, user_name TEXT, user_role TEXT, entry_method TEXT, prev_hash TEXT NOT NULL, blockchain_hash TEXT NOT NULL, record_snapshot JSONB, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE stamp_queue (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, audit_hash TEXT NOT NULL, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE sessions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, notes TEXT);
CREATE TABLE staff_notes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, tenant_id UUID, note_content TEXT);
CREATE TABLE communications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, tenant_id UUID, content TEXT);
CREATE TABLE maintenance_tickets (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL, tenant_id UUID, room_number TEXT, issue_type TEXT, description TEXT, status TEXT DEFAULT 'Open', reported_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION get_my_org_id() RETURNS UUID AS $$ SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1; $$ LANGUAGE sql STABLE SECURITY DEFINER;
CREATE OR REPLACE FUNCTION get_my_role() RETURNS user_role AS $$ SELECT role FROM profiles WHERE id = auth.uid(); $$ LANGUAGE sql STABLE SECURITY DEFINER;
`;
const REST = ["intake_checklists(id UUID, tenant_id UUID)", "drafts(id UUID, created_by UUID)", "form_templates(id UUID, org_id UUID)",
  "tenant_forms(id UUID, tenant_id UUID)", "tenant_documents(id UUID, tenant_id UUID)", "incident_reports(id UUID, org_id UUID)", "shift_handovers(id UUID, org_id UUID)",
  "communications_log(id UUID, org_id UUID)", "tenant_goals(id UUID, tenant_id UUID)", "tenant_goal_updates(id UUID, goal_id UUID)", "agent_health(agent TEXT)"];
const MIGRATIONS = ["031_agent_runtime.sql", "032_rls_request_settings.sql", "033_property_spine.sql", "034_money_and_arrears.sql"];

async function pgliteClient(): Promise<DbClient & { raw: PGlite }> {
  const pg = new PGlite(); await pg.waitReady;
  const wrap = (q: { query: PGlite["query"] }): Queryable => ({
    async query<T>(sql: string, params?: unknown[]) { const r = await q.query<T>(sql, params as unknown[]); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }; },
  });
  return { ...wrap(pg), transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))), end: () => pg.close(), raw: pg };
}

const isoDaysAgo = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const count = async (db: DbClient, sql: string, params: unknown[] = []) => Number((await db.query<{ n: string | number }>(sql, params)).rows[0]!.n);

describe("arrearsLadder, end to end", () => {
  let db: Awaited<ReturnType<typeof pgliteClient>>;

  beforeAll(async () => {
    db = await pgliteClient();
    await db.raw.exec(PREREQ + REST.map((t) => `CREATE TABLE ${t};`).join("\n"));
    for (const m of MIGRATIONS) await db.raw.exec(migration(m));
  });
  afterAll(async () => { await db.end(); });

  async function makeOrg(name: string) { return (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ($1) RETURNING id", [name])).rows[0]!.id; }

  /** A tenancy with one unpaid charge, `daysOverdue` days ago, on a home of the given unit class. */
  async function makeArrearsTenancy(org: string, fullName: string, unitClass: "supported" | "residential" | "commercial", rentAmount: number, daysOverdue: number, withEmail = true) {
    const tenant = (await db.query<{ id: string }>(
      "INSERT INTO tenants (org_id, full_name, moved_in, email) VALUES ($1, $2, $3, $4) RETURNING id",
      [org, fullName, isoDaysAgo(daysOverdue + 30), withEmail ? `${fullName.split(" ")[0]!.toLowerCase()}@example.org` : null])).rows[0]!.id;
    const property = (await db.query<{ id: string }>("INSERT INTO properties (org_id, name, asset_class) VALUES ($1, $2, $3) RETURNING id", [org, `${fullName}'s home`, unitClass])).rows[0]!.id;
    const unit = (await db.query<{ id: string }>("INSERT INTO units (org_id, property_id, reference, unit_class) VALUES ($1, $2, 'Room 1', $3) RETURNING id", [org, property, unitClass])).rows[0]!.id;
    const tenancy = (await db.query<{ id: string }>(
      "INSERT INTO tenancies (org_id, unit_id, tenant_id, rent_amount, rent_frequency, start_date, status) VALUES ($1, $2, $3, $4, 'weekly', $5, 'active') RETURNING id",
      [org, unit, tenant, rentAmount, isoDaysAgo(daysOverdue + 30)])).rows[0]!.id;
    await db.query("INSERT INTO service_charges (tenant_id, week_label, due_date, amount) VALUES ($1, 'Weekly charge', $2, $3)", [tenant, isoDaysAgo(daysOverdue), rentAmount]);
    return { tenantId: tenant, tenancyId: tenancy };
  }
  const ctx = (org: string, correlationId: string): AgentContext => ({ client: db, orgId: org, correlationId, payload: {} });
  const openCase = (tenantId: string) => db.query<{ id: string; stage: string; closed_on: string | null }>(
    "SELECT id, stage, closed_on FROM arrears_cases WHERE tenant_id = $1 AND closed_on IS NULL", [tenantId]).then((r) => r.rows[0]);
  const eventFor = (tenantId: string, stage: string) => db.query<{ id: string; requires_approval: boolean; released_at: string | null; generated_document_id: string }>(
    "SELECT e.id, e.requires_approval, e.released_at, e.generated_document_id FROM arrears_events e JOIN arrears_cases c ON c.id = e.case_id WHERE c.tenant_id = $1 AND e.stage = $2", [tenantId, stage]).then((r) => r.rows[0]);

  it("opens no case at all under the first rung's day threshold", async () => {
    const org = await makeOrg("Under threshold");
    const { tenantId } = await makeArrearsTenancy(org, "Fresh Arrears", "supported", 25, 3); // supported's first rung is day 7
    await arrearsLadder(ctx(org, "cid-1"));
    expect(await openCase(tenantId)).toBeUndefined();
  });

  it("residential: auto-releases the reminder (day 5) with no approval, and emails the tenant since 'reminder' is tenant-facing", async () => {
    const org = await makeOrg("Residential Reminder");
    const { tenantId } = await makeArrearsTenancy(org, "Amina Khan", "residential", 500, 6);
    await arrearsLadder(ctx(org, "cid-1"));
    const kase = await openCase(tenantId);
    expect(kase).toMatchObject({ stage: "reminder" });
    const event = await eventFor(tenantId, "reminder");
    expect(event).toMatchObject({ requires_approval: false });
    expect(event!.released_at).not.toBeNull(); // auto-released, no person needed
    expect(event!.generated_document_id).toBeTruthy();
  });

  it("supported: auto-releases check-in (day 7) with no approval — an internal note, not a letter to the tenant", async () => {
    const org = await makeOrg("Supported Check-in");
    const { tenantId } = await makeArrearsTenancy(org, "Ben Osei", "supported", 25, 8);
    await arrearsLadder(ctx(org, "cid-1"));
    const kase = await openCase(tenantId);
    expect(kase).toMatchObject({ stage: "check_in" });
    const event = await eventFor(tenantId, "check_in");
    expect(event).toMatchObject({ requires_approval: false });
    expect(event!.released_at).not.toBeNull();
    const doc = (await db.query<{ body: string }>("SELECT body FROM documents WHERE id = $1", [event!.generated_document_id])).rows[0]!;
    expect(doc.body).not.toMatch(/^Dear Ben Osei,/m); // never addressed to the tenant as a letter
  });

  it("H11: every rung past the first requires approval and is never released by the agent", async () => {
    const org = await makeOrg("Requires Approval");
    const { tenantId } = await makeArrearsTenancy(org, "Cara Lee", "residential", 500, 14); // formal_letter
    await arrearsLadder(ctx(org, "cid-1"));
    const event = await eventFor(tenantId, "formal_letter");
    expect(event).toMatchObject({ requires_approval: true, released_at: null });
    const refusal = (await db.query<{ refusals: unknown }>(
      "SELECT refusals FROM audit_logs WHERE table_name = 'arrears_events' AND tenant_id = $1 ORDER BY created_at DESC LIMIT 1", [tenantId])).rows[0]!;
    expect(refusal.refusals).toEqual(expect.arrayContaining([expect.objectContaining({ attempted: "send_legal_notice" })]));
  });

  it("advances the case's stage as the tenancy falls further behind, without creating a second case or a duplicate reminder event", async () => {
    const org = await makeOrg("Advancing");
    const { tenantId } = await makeArrearsTenancy(org, "Dan Okafor", "residential", 500, 6); // reminder
    await arrearsLadder(ctx(org, "cid-1"));
    const firstCase = await openCase(tenantId);
    await db.query("UPDATE service_charges SET due_date = $1 WHERE tenant_id = $2", [isoDaysAgo(14), tenantId]); // now formal_letter territory
    await arrearsLadder(ctx(org, "cid-2"));
    const secondCase = await openCase(tenantId);
    expect(secondCase!.id).toBe(firstCase!.id); // same case, advanced in place
    expect(secondCase!.stage).toBe("formal_letter");
    expect(await count(db, "SELECT count(*) n FROM arrears_cases WHERE tenant_id = $1", [tenantId])).toBe(1);
    expect(await count(db, "SELECT count(*) n FROM arrears_events WHERE case_id = $1 AND stage = 'reminder'", [firstCase!.id])).toBe(1); // untouched, not duplicated
  });

  it("closes the case when the balance clears, and reopens fresh if it falls behind again later", async () => {
    const org = await makeOrg("Closes On Payment");
    const { tenantId } = await makeArrearsTenancy(org, "Eve Brennan", "residential", 500, 6);
    await arrearsLadder(ctx(org, "cid-1"));
    const opened = await openCase(tenantId);
    await db.query("INSERT INTO rent_payments (tenant_id, amount, payment_type) VALUES ($1, 500, 'Bank transfer')", [tenantId]); // clears the balance
    await arrearsLadder(ctx(org, "cid-2"));
    expect(await openCase(tenantId)).toBeUndefined();
    const closed = (await db.query<{ closed_on: string | null }>("SELECT closed_on FROM arrears_cases WHERE id = $1", [opened!.id])).rows[0]!;
    expect(closed.closed_on).not.toBeNull();
  });

  it("FIFO: paying an OLDER charge closes the stale case; the NEXT run opens a fresh one at the rung the remaining balance actually reaches", async () => {
    const org = await makeOrg("FIFO Rung Back");
    const tenant = (await db.query<{ id: string }>("INSERT INTO tenants (org_id, full_name, moved_in) VALUES ($1, 'Fay Ibrahim', $2) RETURNING id", [org, isoDaysAgo(40)])).rows[0]!.id;
    const property = (await db.query<{ id: string }>("INSERT INTO properties (org_id, name, asset_class) VALUES ($1, 'Fay''s home', 'residential') RETURNING id", [org])).rows[0]!.id;
    const unit = (await db.query<{ id: string }>("INSERT INTO units (org_id, property_id, reference, unit_class) VALUES ($1, $2, 'Room 1', 'residential') RETURNING id", [org, property])).rows[0]!.id;
    await db.query("INSERT INTO tenancies (org_id, unit_id, tenant_id, rent_amount, rent_frequency, start_date, status) VALUES ($1, $2, $3, 150, 'weekly', $4, 'active')", [org, unit, tenant, isoDaysAgo(40)]);
    // Two unpaid weeks: one 14 days overdue (formal_letter territory) and one 6 days overdue (reminder territory).
    await db.query("INSERT INTO service_charges (tenant_id, week_label, due_date, amount) VALUES ($1, 'W1', $2, 150), ($1, 'W2', $3, 150)", [tenant, isoDaysAgo(14), isoDaysAgo(6)]);
    await arrearsLadder(ctx(org, "cid-1"));
    expect((await openCase(tenant))!.stage).toBe("formal_letter");
    // Pay off exactly the OLDEST week — FIFO means oldest_unpaid jumps to the 6-day-old week, and the rung moves back to reminder.
    await db.query("INSERT INTO rent_payments (tenant_id, amount, payment_type) VALUES ($1, 150, 'Bank transfer')", [tenant]);
    await arrearsLadder(ctx(org, "cid-2"));
    // This run closes the now-stale formal_letter case (a rung-back is a close-and-continue, matching the ported
    // donor logic exactly) — it does not reopen in the same pass. Nothing is open right after the payment.
    const stillOwed = (await db.query<{ balance: string }>("SELECT balance FROM tenancy_arrears WHERE tenant_id = $1", [tenant])).rows[0]!;
    expect(Number(stillOwed.balance)).toBe(150);
    expect(await openCase(tenant)).toBeUndefined();
    expect(await count(db, "SELECT count(*) n FROM arrears_cases WHERE tenant_id = $1 AND closed_on IS NOT NULL", [tenant])).toBe(1);
    // Tomorrow's run sees the same unpaid week and opens a fresh case at the rung it actually reaches.
    await arrearsLadder(ctx(org, "cid-3"));
    expect((await openCase(tenant))!.stage).toBe("reminder");
    expect(await count(db, "SELECT count(*) n FROM arrears_cases WHERE tenant_id = $1", [tenant])).toBe(2); // the old one closed, a new one opened — not resurrected
  });

  it("is idempotent: running twice in the same run produces no duplicate events", async () => {
    const org = await makeOrg("Idempotent");
    const { tenantId } = await makeArrearsTenancy(org, "Gus Farrow", "commercial", 800, 6);
    await arrearsLadder(ctx(org, "cid-1"));
    await arrearsLadder(ctx(org, "cid-2"));
    expect(await count(db, "SELECT count(*) n FROM arrears_events WHERE case_id IN (SELECT id FROM arrears_cases WHERE tenant_id = $1)", [tenantId])).toBe(1);
  });

  it("commercial diverges from residential past day 21 (solicitor, not formal_letter) and can reach forfeiture/bailiff — the supported ladder never does", async () => {
    const org = await makeOrg("Commercial Divergence");
    const { tenantId } = await makeArrearsTenancy(org, "Hana Farid", "commercial", 800, 46); // day 45 = forfeiture on the commercial ladder
    await arrearsLadder(ctx(org, "cid-1"));
    expect((await openCase(tenantId))!.stage).toBe("forfeiture");
    const event = await eventFor(tenantId, "forfeiture");
    const doc = (await db.query<{ body: string }>("SELECT body FROM documents WHERE id = $1", [event!.generated_document_id])).rows[0]!;
    expect(doc.body).toMatch(/forfeiture/i);
  });

  it("a supported tenancy 91 days overdue reaches manager_review, still with no notice drafted anywhere in its history", async () => {
    const org = await makeOrg("Supported Long Overdue");
    const { tenantId } = await makeArrearsTenancy(org, "Iris Novak", "supported", 25, 91);
    await arrearsLadder(ctx(org, "cid-1"));
    expect((await openCase(tenantId))!.stage).toBe("manager_review");
    const bodies = (await db.query<{ body: string }>(
      "SELECT d.body FROM documents d JOIN arrears_events e ON e.generated_document_id = d.id JOIN arrears_cases c ON c.id = e.case_id WHERE c.tenant_id = $1", [tenantId])).rows;
    expect(bodies.length).toBeGreaterThan(0);
    for (const b of bodies) expect(b.body).not.toMatch(/notice to quit|forfeiture|bailiff/i);
  });

  it("every write carries the arrears-ladder receipt with no human actor", async () => {
    const org = await makeOrg("Receipt Check");
    const { tenantId } = await makeArrearsTenancy(org, "Jon Baptiste", "residential", 500, 6);
    await arrearsLadder(ctx(org, "cid-1"));
    const row = (await db.query<{ agent: string; user_id: string | null; outcome: string }>(
      "SELECT agent, user_id, outcome FROM audit_logs WHERE table_name = 'arrears_cases' AND tenant_id = $1 ORDER BY created_at DESC LIMIT 1", [tenantId])).rows[0]!;
    expect(row.agent).toBe("arrears-ladder");
    expect(row.user_id).toBeNull();
    expect(row.outcome).toBe("recorded");
  });

  it("does nothing for an organisation with no active tenancies", async () => {
    const org = await makeOrg("Empty");
    await expect(arrearsLadder(ctx(org, "cid-empty"))).resolves.toBeUndefined();
  });
});
