import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createPgliteClient } from "./pglite";

const root = (() => { let d = path.resolve(__dirname); while (!fs.existsSync(path.join(d, "pnpm-workspace.yaml"))) d = path.dirname(d); return d; })();
const sql = (f: string) => fs.readFileSync(path.join(root, "supabase/migrations", f), "utf-8").replace(/NOTIFY pgrst[^;]*;/g, "");

const STUB = `
CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE auth.fake_uid (uid uuid);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT uid FROM auth.fake_uid LIMIT 1 $$ LANGUAGE sql STABLE;
CREATE TYPE user_role AS ENUM ('manager','support_worker','tenant','admin');
CREATE TYPE brand AS ENUM ('mattys_place','ash_shahada','reliance');
CREATE TABLE organisations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE profiles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, role user_role NOT NULL DEFAULT 'support_worker', tenant_id UUID);
CREATE TABLE tenants (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, full_name TEXT, address TEXT, postcode TEXT, room_number TEXT, moved_in DATE, created_by UUID,
  brand brand DEFAULT 'mattys_place', is_active BOOLEAN DEFAULT TRUE, is_archived BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE settings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), brand brand UNIQUE, service_charge_default NUMERIC(10,2) DEFAULT 150);
INSERT INTO settings (brand) VALUES ('mattys_place');
CREATE TABLE service_charges (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id), week_label TEXT, due_date DATE NOT NULL, amount NUMERIC(10,2) NOT NULL, is_paid BOOLEAN DEFAULT FALSE);
CREATE TABLE rent_payments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id), amount NUMERIC(10,2) NOT NULL, payment_type TEXT, payment_date DATE NOT NULL DEFAULT CURRENT_DATE);
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION get_my_org_id() RETURNS UUID AS $$ SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1; $$ LANGUAGE sql STABLE SECURITY DEFINER;
CREATE OR REPLACE FUNCTION get_my_role() RETURNS user_role AS $$ SELECT role FROM profiles WHERE id = auth.uid(); $$ LANGUAGE sql STABLE SECURITY DEFINER;
`;
const REST = ["sessions(id UUID, tenant_id UUID)", "intake_checklists(id UUID, tenant_id UUID)", "audit_logs(id UUID, tenant_id UUID, org_id UUID, user_id UUID)", "stamp_queue(id UUID, tenant_id UUID)",
  "drafts(id UUID, created_by UUID)", "form_templates(id UUID, org_id UUID)", "tenant_forms(id UUID, tenant_id UUID)", "maintenance_tickets(id UUID, org_id UUID, tenant_id UUID)",
  "tenant_documents(id UUID, tenant_id UUID)", "incident_reports(id UUID, org_id UUID)", "shift_handovers(id UUID, org_id UUID)", "communications_log(id UUID, org_id UUID)",
  "staff_notes(id UUID, org_id UUID)", "communications(id UUID, org_id UUID)", "tenant_goals(id UUID, tenant_id UUID)", "tenant_goal_updates(id UUID, goal_id UUID)", "agent_health(agent TEXT)"];

const d = (daysAgo: number) => { const x = new Date(); x.setUTCDate(x.getUTCDate() - daysAgo); return x.toISOString().slice(0, 10); };

describe("034_money_and_arrears.sql", () => {
  let db: Awaited<ReturnType<typeof createPgliteClient>>;
  let org: string, amina: string;
  beforeAll(async () => {
    db = await createPgliteClient();
    await db.raw.exec(STUB + REST.map((t) => `CREATE TABLE ${t};`).join("\n"));
    await db.raw.exec(sql("032_rls_request_settings.sql"));
    org = (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ('A') RETURNING id")).rows[0]!.id;
    amina = (await db.query<{ id: string }>("INSERT INTO tenants (org_id, full_name, address, postcode, room_number, moved_in) VALUES ($1,'Amina','14 R St','B12 8AA','Room 4','2026-01-01') RETURNING id", [org])).rows[0]!.id;
    // Three weekly charges, oldest first: 21, 14 and 7 days ago, plus one not yet due.
    for (const [label, days] of [["W1", 21], ["W2", 14], ["W3", 7], ["W4", -7]] as const)
      await db.query("INSERT INTO service_charges (tenant_id, week_label, due_date, amount) VALUES ($1, $2, $3, 150)", [amina, label, d(days)]);
    await db.query("INSERT INTO rent_payments (tenant_id, amount, payment_type, payment_date) VALUES ($1, 200, 'Housing Benefit', $2)", [amina, d(10)]);
    await db.raw.exec(sql("033_property_spine.sql"));
    await db.raw.exec(sql("034_money_and_arrears.sql"));
  });
  afterAll(async () => { await db.end(); });

  it("links existing charges and payments to the active tenancy", async () => {
    const r = (await db.query<{ n: string | number }>("SELECT count(*) n FROM service_charges WHERE tenancy_id IS NOT NULL")).rows[0]!;
    expect(Number(r.n)).toBe(4);
    expect(Number((await db.query<{ n: string | number }>("SELECT count(*) n FROM rent_payments WHERE tenancy_id IS NULL")).rows[0]!.n)).toBe(0);
  });

  it("FIFO: balance counts every charge; oldest_unpaid is the oldest past-due charge not covered by payments", async () => {
    let a = (await db.query<{ balance: string | number; oldest_unpaid: Date | string | null }>("SELECT balance, oldest_unpaid::text AS oldest_unpaid FROM tenancy_arrears WHERE tenant_id = $1", [amina])).rows[0]!;
    expect(Number(a.balance)).toBe(400);                 // 600 charged − 200 paid
    expect(String(a.oldest_unpaid).slice(0, 10)).toBe(d(14)); // W1 (150) covered; W2 cumulative 300 > 200
    await db.query("INSERT INTO rent_payments (tenant_id, amount, payment_type, payment_date) VALUES ($1, 100, 'Top-up', $2)", [amina, d(3)]);
    a = (await db.query<{ balance: string | number; oldest_unpaid: Date | string | null }>("SELECT balance, oldest_unpaid::text AS oldest_unpaid FROM tenancy_arrears WHERE tenant_id = $1", [amina])).rows[0]!;
    expect(Number(a.balance)).toBe(300);
    expect(String(a.oldest_unpaid).slice(0, 10)).toBe(d(7));  // cumulative 300 covered exactly; W3 (450) is next
    await db.query("INSERT INTO rent_payments (tenant_id, amount, payment_type, payment_date) VALUES ($1, 150, 'Top-up', $2)", [amina, d(1)]);
    a = (await db.query<{ balance: string | number; oldest_unpaid: Date | string | null }>("SELECT balance, oldest_unpaid::text AS oldest_unpaid FROM tenancy_arrears WHERE tenant_id = $1", [amina])).rows[0]!;
    expect(Number(a.balance)).toBe(150);                 // only the future week remains
    expect(a.oldest_unpaid).toBeNull();                  // nothing past due is unpaid
  });

  it("the compatibility view keeps the old sign and shape", async () => {
    const c = (await db.query<{ total_charged: string | number; total_paid: string | number; balance: string | number }>("SELECT total_charged, total_paid, balance FROM tenant_arrears_balance WHERE tenant_id = $1", [amina])).rows[0]!;
    expect([Number(c.total_charged), Number(c.total_paid), Number(c.balance)]).toEqual([600, 450, -150]);
  });

  it("creates the queue, ladder and document tables with their constraints", async () => {
    await db.query("INSERT INTO rent_unmatched (org_id, amount, received_on, external_reference, confidence, source_adapter, is_simulated) VALUES ($1, 75, CURRENT_DATE, 'sim-1', 0.6, 'sim:bank', true)", [org]);
    await expect(db.query("INSERT INTO rent_unmatched (org_id, amount, received_on, external_reference, confidence, source_adapter, is_simulated) VALUES ($1, 75, CURRENT_DATE, 'sim-1', 0.6, 'sim:bank', true)", [org])).rejects.toThrow();
    const caseId = (await db.query<{ id: string }>("INSERT INTO arrears_cases (org_id, tenant_id, stage, balance_at_open) VALUES ($1, $2, 'check_in', 150) RETURNING id", [org, amina])).rows[0]!.id;
    const doc = (await db.query<{ id: string }>("INSERT INTO documents (org_id, kind, title, body, tenant_id) VALUES ($1, 'arrears_hb_chase', 'Query to the council', '…', $2) RETURNING id", [org, amina])).rows[0]!.id;
    const ev = (await db.query<{ requires_approval: boolean }>("INSERT INTO arrears_events (org_id, case_id, stage, action, generated_document_id) VALUES ($1, $2, 'hb_chase', 'draft_council_hb_query', $3) RETURNING requires_approval", [org, caseId, doc])).rows[0]!;
    expect(ev.requires_approval).toBe(true); // H11 default
    await db.query("DELETE FROM documents WHERE id = $1", [doc]);
    expect((await db.query<{ generated_document_id: string | null }>("SELECT generated_document_id FROM arrears_events WHERE case_id = $1", [caseId])).rows[0]!.generated_document_id).toBeNull();
  });

  it("is idempotent", async () => {
    await expect(db.raw.exec(sql("034_money_and_arrears.sql"))).resolves.not.toThrow();
  });
});
