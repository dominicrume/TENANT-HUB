import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { DbClient, Queryable } from "@tenant-hub/db";
import { complianceWatch } from "../src/agents/compliance-watch";
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
CREATE TABLE sessions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, notes TEXT);
CREATE TABLE service_charges (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, due_date DATE, amount NUMERIC(10,2));
CREATE TABLE rent_payments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, amount NUMERIC(10,2), payment_date DATE DEFAULT CURRENT_DATE);
CREATE TABLE staff_notes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, tenant_id UUID, note_content TEXT);
CREATE TABLE communications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, tenant_id UUID, content TEXT);
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

const d = (daysFromToday: number) => { const x = new Date(); x.setUTCDate(x.getUTCDate() + daysFromToday); return x.toISOString().slice(0, 10); };

describe("compliance-watch", () => {
  let db: Awaited<ReturnType<typeof pgliteClient>>;
  let org: string, ctx: AgentContext;

  beforeAll(async () => {
    db = await pgliteClient();
    await db.raw.exec(PREREQ + REST.map((t) => `CREATE TABLE ${t};`).join("\n"));
    // 031 (jobs/agent_health/agent_telemetry), 032 (RLS + helper functions writeWithAudit relies on),
    // 033 (property spine), 034 (arrears/documents, unused here), 035 (certificates/insurance).
    for (const m of ["031_agent_runtime.sql", "032_rls_request_settings.sql", "033_property_spine.sql", "034_money_and_arrears.sql", "035_compliance_insurance.sql"]) {
      await db.raw.exec(migration(m));
    }
    org = (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ('Matty''s Place') RETURNING id")).rows[0]!.id;
    ctx = { client: db, orgId: org, correlationId: "cid-1", payload: {} };
  });
  afterAll(async () => { await db.end(); });

  /** A fresh supported home for each test, so certificate state never leaks between them. */
  async function makeHome(name: string) {
    return (await db.query<{ id: string }>(
      "INSERT INTO properties (org_id, name, asset_class) VALUES ($1, $2, 'supported') RETURNING id", [org, name])).rows[0]!.id;
  }
  async function certType(name: string) {
    return (await db.query<{ id: string }>("SELECT id FROM certificate_types WHERE name = $1", [name])).rows[0]!.id;
  }
  async function grantCert(propertyId: string, typeName: string, expiresOn: string | null) {
    const typeId = await certType(typeName);
    await db.query("INSERT INTO certificates (org_id, property_id, certificate_type_id, expires_on) VALUES ($1, $2, $3, $4)", [org, propertyId, typeId, expiresOn]);
  }
  const openAlert = async (propertyId: string, certificateName: string) =>
    (await db.query<{ id: string; kind: string; expires_on: string | null }>(
      "SELECT id, kind, expires_on::text AS expires_on FROM compliance_alerts WHERE org_id = $1 AND property_id = $2 AND certificate_name = $3 AND resolved_at IS NULL",
      [org, propertyId, certificateName])).rows[0];

  it("raises 'missing' for a required certificate the home has never held — the seeded Fire Risk Assessment scenario", async () => {
    const home = await makeHome("14 Ravenhurst St");
    await complianceWatch({ ...ctx, correlationId: "cid-missing" });
    const alert = await openAlert(home, "Fire Risk Assessment");
    expect(alert).toMatchObject({ kind: "missing", expires_on: null });
  });

  it("does not raise an alert for a certificate that is valid, and raises for every required certificate a home lacks", async () => {
    const home = await makeHome("9 Sparkhill Rd");
    await grantCert(home, "Gas Safety (CP12)", d(200)); // comfortably valid
    await complianceWatch({ ...ctx, correlationId: "cid-a" });
    expect(await openAlert(home, "Gas Safety (CP12)")).toBeUndefined();
    // every OTHER required supported certificate is still missing
    const others = ["EICR", "EPC", "Fire Risk Assessment", "Fire alarm & emergency lighting test", "Smoke & CO alarms", "Legionella risk assessment", "HMO licence", "PAT testing"];
    for (const name of others) expect(await openAlert(home, name), name).toMatchObject({ kind: "missing" });
  });

  it("raises the correct threshold kind at each boundary and moves the SAME alert row as the certificate approaches expiry", async () => {
    const home = await makeHome("Threshold House");
    await grantCert(home, "EPC", d(85));
    await complianceWatch({ ...ctx, correlationId: "cid-1" });
    const first = await openAlert(home, "EPC");
    expect(first).toMatchObject({ kind: "expiring_90" });

    // The certificate ages toward expiry; simulate by re-running with a nearer date on the SAME certificate row.
    await db.query("UPDATE certificates SET expires_on = $1 WHERE property_id = $2 AND certificate_type_id = (SELECT id FROM certificate_types WHERE name = 'EPC')", [d(25), home]);
    await complianceWatch({ ...ctx, correlationId: "cid-2" });
    const second = await openAlert(home, "EPC");
    expect(second).toMatchObject({ kind: "expiring_30" });
    expect(second!.id).toBe(first!.id); // same row updated in place, not a duplicate

    await db.query("UPDATE certificates SET expires_on = $1 WHERE property_id = $2 AND certificate_type_id = (SELECT id FROM certificate_types WHERE name = 'EPC')", [d(-3), home]);
    await complianceWatch({ ...ctx, correlationId: "cid-3" });
    const third = await openAlert(home, "EPC");
    expect(third).toMatchObject({ kind: "expired" });
    expect(third!.id).toBe(first!.id);

    // A fresh certificate resolves the alert.
    await grantCert(home, "EPC", d(400));
    await complianceWatch({ ...ctx, correlationId: "cid-4" });
    expect(await openAlert(home, "EPC")).toBeUndefined();
    const resolved = (await db.query<{ resolved_at: string | null }>("SELECT resolved_at FROM compliance_alerts WHERE id = $1", [first!.id])).rows[0]!;
    expect(resolved.resolved_at).not.toBeNull();
  });

  it("is idempotent: running twice with nothing changed does not create a second open alert or touch the existing row", async () => {
    const home = await makeHome("Repeat House");
    await complianceWatch({ ...ctx, correlationId: "cid-1" });
    const before = await openAlert(home, "HMO licence");
    await complianceWatch({ ...ctx, correlationId: "cid-2" });
    const after = await openAlert(home, "HMO licence");
    expect(after!.id).toBe(before!.id);
    const count = (await db.query<{ n: string | number }>(
      "SELECT count(*) n FROM compliance_alerts WHERE org_id = $1 AND property_id = $2 AND certificate_name = 'HMO licence'", [org, home])).rows[0]!.n;
    expect(Number(count)).toBe(1);
  });

  it("a mixed property with commercial units also needs the commercial certificate set", async () => {
    const home = (await db.query<{ id: string }>("INSERT INTO properties (org_id, name, asset_class) VALUES ($1, 'Mixed Block', 'mixed') RETURNING id", [org])).rows[0]!.id;
    await db.query("INSERT INTO units (org_id, property_id, reference, unit_class) VALUES ($1, $2, 'Shop 1', 'commercial')", [org, home]);
    await complianceWatch({ ...ctx, correlationId: "cid-mixed" });
    expect(await openAlert(home, "Asbestos Register")).toMatchObject({ kind: "missing" }); // commercial-only cert
    expect(await openAlert(home, "Gas Safety (CP12) (residential)")).toBeUndefined();       // residential set never required here
  });

  it("every write carries the compliance-watch receipt and no human actor", async () => {
    const home = await makeHome("Receipt House");
    await complianceWatch({ ...ctx, correlationId: "cid-receipt" });
    const row = (await db.query<{ agent: string; outcome: string; user_id: string | null; sources_read: unknown }>(
      "SELECT agent, outcome, user_id, sources_read FROM audit_logs WHERE table_name = 'compliance_alerts' AND record_id = (SELECT id FROM compliance_alerts WHERE property_id = $1 LIMIT 1)", [home])).rows[0]!;
    expect(row.agent).toBe("compliance-watch");
    expect(row.outcome).toBe("recorded");
    expect(row.user_id).toBeNull();
    expect(row.sources_read).toEqual(expect.arrayContaining([expect.objectContaining({ key: "certificates" }), expect.objectContaining({ key: "certificate_rules" })]));
  });

  it("touches nothing when the organisation has no homes yet", async () => {
    const empty = (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ('Empty Org') RETURNING id")).rows[0]!.id;
    await expect(complianceWatch({ client: db, orgId: empty, correlationId: "cid-empty", payload: {} })).resolves.toBeUndefined();
    expect(Number((await db.query<{ n: string | number }>("SELECT count(*) n FROM compliance_alerts WHERE org_id = $1", [empty])).rows[0]!.n)).toBe(0);
  });
});
