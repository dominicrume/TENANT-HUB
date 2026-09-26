import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createPgliteClient } from "./pglite";

/** Applies 031 → 037 in order on a stub of the pre-existing schema, proving the whole new-table set on a real Postgres. */
const root = (() => { let d = path.resolve(__dirname); while (!fs.existsSync(path.join(d, "pnpm-workspace.yaml"))) d = path.dirname(d); return d; })();
const sql = (f: string) => fs.readFileSync(path.join(root, "supabase/migrations", f), "utf-8").replace(/NOTIFY pgrst[^;]*;/g, "");

const STUB = `
CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE auth.fake_uid (uid uuid);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT uid FROM auth.fake_uid LIMIT 1 $$ LANGUAGE sql STABLE;
CREATE TYPE user_role AS ENUM ('manager','support_worker','tenant','admin');
CREATE TYPE brand AS ENUM ('mattys_place','ash_shahada','reliance');
CREATE TYPE audit_action AS ENUM ('CREATE','UPDATE','DELETE','VERIFY','SIGN','EXPORT','LOGIN');
CREATE TABLE organisations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE profiles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, role user_role NOT NULL DEFAULT 'support_worker', tenant_id UUID, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE tenants (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, full_name TEXT, address TEXT, postcode TEXT, room_number TEXT, moved_in DATE, created_by UUID,
  brand brand DEFAULT 'mattys_place', is_active BOOLEAN DEFAULT TRUE, is_archived BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE settings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), brand brand UNIQUE, service_charge_default NUMERIC(10,2) DEFAULT 150);
CREATE TABLE service_charges (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, due_date DATE NOT NULL, amount NUMERIC(10,2) NOT NULL);
CREATE TABLE rent_payments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, amount NUMERIC(10,2) NOT NULL, payment_date DATE NOT NULL DEFAULT CURRENT_DATE);
CREATE TABLE sessions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, notes TEXT);
CREATE TABLE staff_notes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, tenant_id UUID, note_content TEXT);
CREATE TABLE communications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, tenant_id UUID, content TEXT);
CREATE TABLE maintenance_tickets (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL, tenant_id UUID, room_number TEXT, issue_type TEXT, description TEXT, status TEXT DEFAULT 'Open', reported_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, action audit_action NOT NULL, table_name TEXT NOT NULL, record_id UUID, user_id UUID, user_name TEXT, user_role TEXT, entry_method TEXT, prev_hash TEXT NOT NULL, blockchain_hash TEXT NOT NULL, record_snapshot JSONB, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION get_my_org_id() RETURNS UUID AS $$ SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1; $$ LANGUAGE sql STABLE SECURITY DEFINER;
CREATE OR REPLACE FUNCTION get_my_role() RETURNS user_role AS $$ SELECT role FROM profiles WHERE id = auth.uid(); $$ LANGUAGE sql STABLE SECURITY DEFINER;
`;
const REST = ["intake_checklists(id UUID, tenant_id UUID)", "stamp_queue(id UUID, tenant_id UUID)", "drafts(id UUID, created_by UUID)", "form_templates(id UUID, org_id UUID)",
  "tenant_forms(id UUID, tenant_id UUID)", "tenant_documents(id UUID, tenant_id UUID)", "incident_reports(id UUID, org_id UUID)", "shift_handovers(id UUID, org_id UUID)",
  "communications_log(id UUID, org_id UUID)", "tenant_goals(id UUID, tenant_id UUID)", "tenant_goal_updates(id UUID, goal_id UUID)"];
const MIGRATIONS = ["031_agent_runtime.sql", "032_rls_request_settings.sql", "033_property_spine.sql", "034_money_and_arrears.sql", "035_compliance_insurance.sql", "036_regulation_repairs.sql", "037_commitments.sql"];

describe("035–037 on top of 031–034", () => {
  let db: Awaited<ReturnType<typeof createPgliteClient>>;
  let org: string, amina: string, ticket: string;
  beforeAll(async () => {
    db = await createPgliteClient();
    await db.raw.exec(STUB + REST.map((t) => `CREATE TABLE ${t};`).join("\n"));
    org = (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ('A') RETURNING id")).rows[0]!.id;
    amina = (await db.query<{ id: string }>("INSERT INTO tenants (org_id, full_name, address, postcode, room_number, moved_in) VALUES ($1,'Amina','14 R St','B12 8AA','Room 4','2026-01-01') RETURNING id", [org])).rows[0]!.id;
    ticket = (await db.query<{ id: string }>("INSERT INTO maintenance_tickets (org_id, tenant_id, room_number, issue_type, description, status) VALUES ($1, $2, 'Room 4', 'Plumbing', 'leak', 'Open') RETURNING id", [org, amina])).rows[0]!.id;
    for (const m of MIGRATIONS) await db.raw.exec(sql(m));
  });
  afterAll(async () => { await db.end(); });

  it("applies every migration twice without error", async () => {
    for (const m of MIGRATIONS) await expect(db.raw.exec(sql(m)), m).resolves.not.toThrow();
  });

  it("creates the full new-table set", async () => {
    const tables = (await db.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map((r) => r.table_name);
    for (const t of ["certificate_types", "certificates", "compliance_alerts", "insurance_policies", "insurance_renewal_cycles", "insurance_quotes",
      "regulation_sources", "regulation_items", "regulation_impacts", "trades", "dispatch_jobs", "commitments", "properties", "units", "tenancies", "rent_unmatched", "arrears_cases", "arrears_events", "documents", "jobs"])
      expect(tables, t).toContain(t);
  });

  it("seeds the three statutory certificate sets once", async () => {
    // unit_class is a Postgres enum; ORDER BY sorts by declaration order (supported, residential, commercial), not alphabetically.
    const byClass = (await db.query<{ applies_to: string; n: string | number }>("SELECT applies_to, count(*) n FROM certificate_types GROUP BY applies_to ORDER BY applies_to")).rows;
    expect(byClass.map((r) => [r.applies_to, Number(r.n)])).toEqual([["supported", 9], ["residential", 5], ["commercial", 6]]);
  });

  it("extends the existing ticket with where, how and the triage result, keeping its old status text", async () => {
    const t = (await db.query<{ status: string; property_id: string | null; unit_id: string | null; reported_via: string; severity: string | null }>(
      "SELECT status, property_id, unit_id, reported_via, severity FROM maintenance_tickets WHERE id = $1", [ticket])).rows[0]!;
    expect(t.status).toBe("Open");
    expect(t.property_id).not.toBeNull(); // backfilled from Amina's tenancy (033)
    expect(t.unit_id).not.toBeNull();
    expect(t.reported_via).toBe("staff");
    expect(t.severity).toBeNull();
    await db.query("UPDATE maintenance_tickets SET severity = 'emergency', category = 'plumbing', reported_via = 'qr', raw_report = 'water everywhere' WHERE id = $1", [ticket]);
    await expect(db.query("UPDATE maintenance_tickets SET severity = 'catastrophic' WHERE id = $1", [ticket])).rejects.toThrow();
  });

  it("one open alert per property × certificate × kind; regulation items unique per org; commitments unique per promise", async () => {
    const prop = (await db.query<{ id: string }>("SELECT id FROM properties LIMIT 1")).rows[0]!.id;
    await db.query("INSERT INTO compliance_alerts (org_id, property_id, certificate_name, kind) VALUES ($1, $2, 'Fire Risk Assessment', 'missing')", [org, prop]);
    await expect(db.query("INSERT INTO compliance_alerts (org_id, property_id, certificate_name, kind) VALUES ($1, $2, 'Fire Risk Assessment', 'missing')", [org, prop])).rejects.toThrow();
    await db.query("UPDATE compliance_alerts SET resolved_at = NOW()");
    await expect(db.query("INSERT INTO compliance_alerts (org_id, property_id, certificate_name, kind) VALUES ($1, $2, 'Fire Risk Assessment', 'missing')", [org, prop])).resolves.toBeTruthy();
    await db.query("INSERT INTO regulation_items (org_id, external_id, title) VALUES ($1, 'uksi/2026/900', 'x')", [org]);
    await expect(db.query("INSERT INTO regulation_items (org_id, external_id, title) VALUES ($1, 'uksi/2026/900', 'again')", [org])).rejects.toThrow();
    const note = (await db.query<{ id: string }>("INSERT INTO staff_notes (org_id, tenant_id, note_content) VALUES ($1, $2, 'Plumber to visit Thursday') RETURNING id", [org, amina])).rows[0]!.id;
    await db.query("INSERT INTO commitments (org_id, tenant_id, source_table, source_id, text, owner, due_on) VALUES ($1, $2, 'staff_notes', $3, 'Plumber to visit', 'contractor', CURRENT_DATE + 2)", [org, amina, note]);
    await expect(db.query("INSERT INTO commitments (org_id, tenant_id, source_table, source_id, text, owner) VALUES ($1, $2, 'staff_notes', $3, 'Plumber to visit', 'contractor')", [org, amina, note])).rejects.toThrow();
  });

  it("insurance quotes must declare whether they are simulated (H9)", async () => {
    const prop = (await db.query<{ id: string }>("SELECT id FROM properties LIMIT 1")).rows[0]!.id;
    const pol = (await db.query<{ id: string }>("INSERT INTO insurance_policies (org_id, property_id, insurer, renewal_date, annual_premium) VALUES ($1, $2, 'Acme', CURRENT_DATE + 14, 1200) RETURNING id", [org, prop])).rows[0]!.id;
    const cyc = (await db.query<{ id: string; status: string }>("INSERT INTO insurance_renewal_cycles (org_id, policy_id, prior_premium) VALUES ($1, $2, 1200) RETURNING id, status", [org, pol])).rows[0]!;
    expect(cyc.status).toBe("detected");
    await expect(db.query("INSERT INTO insurance_quotes (org_id, policy_id, cycle_id, provider_name, premium, source_adapter) VALUES ($1, $2, $3, 'P', 900, 'sim:insurance')", [org, pol, cyc.id])).rejects.toThrow(/is_simulated/);
  });
});
