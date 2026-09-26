import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createPgliteClient } from "./pglite";

/**
 * RLS on request settings (migration 032), proven on a real Postgres in-process.
 * The stub mirrors every table 032 touches, with RLS enabled and the pre-032
 * policies that 032 does not replace (write policies from 017/026). Queries run
 * as a NON-superuser role so RLS actually applies.
 */
const root = (() => { let d = path.resolve(__dirname); while (!fs.existsSync(path.join(d, "pnpm-workspace.yaml"))) d = path.dirname(d); return d; })();
const sql = (f: string) => fs.readFileSync(path.join(root, "supabase/migrations", f), "utf-8").replace(/NOTIFY pgrst[^;]*;/g, "");

const STUB = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.fake_uid (uid uuid);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT uid FROM auth.fake_uid LIMIT 1 $$ LANGUAGE sql STABLE;
CREATE TYPE user_role AS ENUM ('manager','support_worker','tenant','admin');
CREATE TYPE audit_action AS ENUM ('CREATE','UPDATE','DELETE','VERIFY','SIGN','EXPORT','LOGIN');
CREATE TYPE stamp_status AS ENUM ('pending','processing','done','failed','dead_letter');
CREATE TABLE organisations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE profiles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, role user_role NOT NULL DEFAULT 'support_worker', tenant_id UUID, full_name TEXT);
CREATE TABLE tenants (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, full_name TEXT, created_by UUID);
CREATE TABLE sessions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, notes TEXT);
CREATE TABLE service_charges (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, amount NUMERIC);
CREATE TABLE rent_payments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, amount NUMERIC);
CREATE TABLE intake_checklists (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID);
CREATE TABLE audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, org_id UUID, user_id UUID, action audit_action, table_name TEXT, prev_hash TEXT, blockchain_hash TEXT);
CREATE TABLE stamp_queue (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, audit_hash TEXT, status stamp_status DEFAULT 'pending');
CREATE TABLE drafts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), created_by UUID, step INT DEFAULT 1);
CREATE TABLE form_templates (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, name TEXT);
CREATE TABLE tenant_forms (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, template_id UUID);
CREATE TABLE maintenance_tickets (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, tenant_id UUID, description TEXT);
CREATE TABLE tenant_documents (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, name TEXT);
CREATE TABLE incident_reports (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, description TEXT);
CREATE TABLE shift_handovers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, notes TEXT);
CREATE TABLE communications_log (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, body TEXT);
CREATE TABLE staff_notes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, tenant_id UUID, note_content TEXT);
CREATE TABLE communications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, tenant_id UUID, content TEXT);
CREATE TABLE tenant_goals (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, area TEXT);
CREATE TABLE tenant_goal_updates (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), goal_id UUID, comment TEXT);
CREATE TABLE settings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), brand TEXT, service_charge_default NUMERIC);
CREATE TABLE agent_health (agent TEXT PRIMARY KEY, state TEXT);
-- Helpers as they exist before 032 (002/017), so 032's CREATE OR REPLACE is exercised as a replacement.
CREATE OR REPLACE FUNCTION get_my_org_id() RETURNS UUID AS $$ SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1; $$ LANGUAGE sql STABLE SECURITY DEFINER;
CREATE OR REPLACE FUNCTION get_my_role() RETURNS user_role AS $$ SELECT role FROM profiles WHERE id = auth.uid(); $$ LANGUAGE sql STABLE SECURITY DEFINER;
CREATE OR REPLACE FUNCTION is_assigned_to_tenant(t_id UUID) RETURNS BOOLEAN AS $$ SELECT EXISTS (SELECT 1 FROM tenants WHERE id = t_id AND created_by = auth.uid()); $$ LANGUAGE sql STABLE SECURITY DEFINER;
-- Write policies 032 keeps (from 017/026), needed to test role gating on writes.
CREATE POLICY "org_tenants_insert" ON tenants FOR INSERT WITH CHECK (org_id = get_my_org_id() AND get_my_role() IN ('manager','support_worker','admin'));
CREATE POLICY "org_tenants_update" ON tenants FOR UPDATE USING (org_id = get_my_org_id() AND get_my_role() IN ('manager','support_worker','admin'));
CREATE POLICY "org_tenants_delete" ON tenants FOR DELETE USING (org_id = get_my_org_id() AND get_my_role() IN ('manager','admin'));
CREATE POLICY "org_draft_read" ON drafts FOR SELECT USING (created_by IN (SELECT id FROM profiles WHERE org_id = get_my_org_id()));
CREATE POLICY "org_charges_insert" ON service_charges FOR INSERT WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()) AND get_my_role() IN ('manager','support_worker','admin'));
CREATE ROLE app_web NOLOGIN;
GRANT USAGE ON SCHEMA public, auth TO app_web;
GRANT ALL ON ALL TABLES IN SCHEMA public TO app_web;
GRANT SELECT ON auth.fake_uid TO app_web;
`;
const TABLES = ["organisations","profiles","tenants","sessions","service_charges","rent_payments","intake_checklists","audit_logs","stamp_queue","drafts","form_templates","tenant_forms","maintenance_tickets","tenant_documents","incident_reports","shift_handovers","communications_log","staff_notes","communications","tenant_goals","tenant_goal_updates","settings","agent_health"];

describe("032: RLS keyed on request settings, as a non-superuser", () => {
  let db: Awaited<ReturnType<typeof createPgliteClient>>;
  let A: string, B: string, tA1: string, tA2: string, tB1: string, managerA: string, workerA: string, tenantUserA1: string;

  /** Run fn as app_web with the given settings, in one transaction. */
  const as = async <T,>(scope: { org?: string; user?: string; role?: string; tenant?: string }, fn: (q: (s: string, p?: unknown[]) => Promise<{ rows: T[]; rowCount: number | null }>) => Promise<unknown>) =>
    db.transaction(async (tx) => {
      await tx.query("SET LOCAL ROLE app_web");
      for (const [k, v] of Object.entries({ current_org: scope.org, current_user: scope.user, current_role: scope.role, current_tenant: scope.tenant }))
        if (v) await tx.query(`SELECT set_config('app.${k}', $1, true)`, [v]);
      return fn((s, p) => tx.query<T>(s, p));
    });
  const count = async (scope: Parameters<typeof as>[0], table: string) => {
    let n = -1; await as<{ n: string | number }>(scope, async (q) => { n = Number((await q(`SELECT count(*) n FROM ${table}`)).rows[0]!.n); }); return n;
  };

  beforeAll(async () => {
    db = await createPgliteClient();
    await db.raw.exec(STUB);
    for (const t of TABLES) await db.raw.exec(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${t} FORCE ROW LEVEL SECURITY;`);
    await db.raw.exec(sql("032_rls_request_settings.sql"));
    A = (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ('A') RETURNING id")).rows[0]!.id;
    B = (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ('B') RETURNING id")).rows[0]!.id;
    tA1 = (await db.query<{ id: string }>("INSERT INTO tenants (org_id, full_name) VALUES ($1,'A1') RETURNING id", [A])).rows[0]!.id;
    tA2 = (await db.query<{ id: string }>("INSERT INTO tenants (org_id, full_name) VALUES ($1,'A2') RETURNING id", [A])).rows[0]!.id;
    tB1 = (await db.query<{ id: string }>("INSERT INTO tenants (org_id, full_name) VALUES ($1,'B1') RETURNING id", [B])).rows[0]!.id;
    managerA = (await db.query<{ id: string }>("INSERT INTO profiles (org_id, role, full_name) VALUES ($1,'manager','M') RETURNING id", [A])).rows[0]!.id;
    workerA = (await db.query<{ id: string }>("INSERT INTO profiles (org_id, role, full_name) VALUES ($1,'support_worker','W') RETURNING id", [A])).rows[0]!.id;
    tenantUserA1 = (await db.query<{ id: string }>("INSERT INTO profiles (org_id, role, tenant_id, full_name) VALUES ($1,'tenant',$2,'T') RETURNING id", [A, tA1])).rows[0]!.id;
    await db.query("INSERT INTO profiles (org_id, role, full_name) VALUES ($1,'manager','MB')", [B]);
    for (const [t, tid] of [["A1", tA1], ["A2", tA2], ["B1", tB1]] as const) {
      await db.query("INSERT INTO service_charges (tenant_id, amount) VALUES ($1, 150)", [tid]);
      await db.query("INSERT INTO rent_payments (tenant_id, amount) VALUES ($1, 150)", [tid]);
      await db.query("INSERT INTO sessions (tenant_id, notes) VALUES ($1, $2)", [tid, `session ${t}`]);
      await db.query("INSERT INTO intake_checklists (tenant_id) VALUES ($1)", [tid]);
      await db.query("INSERT INTO tenant_documents (tenant_id, name) VALUES ($1, 'doc')", [tid]);
      await db.query("INSERT INTO tenant_forms (tenant_id) VALUES ($1)", [tid]);
      const g = (await db.query<{ id: string }>("INSERT INTO tenant_goals (tenant_id, area) VALUES ($1, 'x') RETURNING id", [tid])).rows[0]!.id;
      await db.query("INSERT INTO tenant_goal_updates (goal_id, comment) VALUES ($1, 'c')", [g]);
      await db.query("INSERT INTO stamp_queue (tenant_id, audit_hash) VALUES ($1, 'h')", [tid]);
    }
    for (const [org, tid] of [[A, tA1], [B, tB1]] as const) {
      await db.query("INSERT INTO maintenance_tickets (org_id, tenant_id, description) VALUES ($1, $2, 'leak')", [org, tid]);
      await db.query("INSERT INTO maintenance_tickets (org_id, tenant_id, description) VALUES ($1, NULL, 'hall light')", [org]);
      await db.query("INSERT INTO incident_reports (org_id, description) VALUES ($1, 'i')", [org]);
      await db.query("INSERT INTO shift_handovers (org_id, notes) VALUES ($1, 'h')", [org]);
      await db.query("INSERT INTO communications_log (org_id, body) VALUES ($1, 'b')", [org]);
      await db.query("INSERT INTO staff_notes (org_id, tenant_id, note_content) VALUES ($1, $2, 'private')", [org, tid]);
      await db.query("INSERT INTO communications (org_id, tenant_id, content) VALUES ($1, $2, 'msg')", [org, tid]);
      await db.query("INSERT INTO form_templates (org_id, name) VALUES ($1, 'f')", [org]);
      await db.query("INSERT INTO audit_logs (org_id, tenant_id, action, table_name, prev_hash, blockchain_hash) VALUES ($1, $2, 'CREATE', 'tenants', '0', '1')", [org, tid]);
    }
    await db.query("INSERT INTO drafts (created_by) VALUES ($1), ($2)", [managerA, workerA]);
    await db.query("INSERT INTO settings (brand) VALUES ('mattys_place')");
    await db.query("INSERT INTO agent_health (agent, state) VALUES ('chain-check', 'idle')");
  });
  afterAll(async () => { await db.end(); });

  it("a manager scoped to org A sees only org A rows on every table, and zero of org B", async () => {
    const m = { org: A, user: managerA, role: "manager" };
    expect(await count(m, "tenants")).toBe(2);
    expect(await count(m, "organisations")).toBe(1);
    expect(await count(m, "profiles")).toBe(3);
    for (const t of ["service_charges", "rent_payments", "sessions", "intake_checklists", "tenant_documents", "tenant_forms", "tenant_goals", "tenant_goal_updates", "stamp_queue"]) expect(await count(m, t), t).toBe(2);
    for (const t of ["incident_reports", "shift_handovers", "communications_log", "staff_notes", "communications", "form_templates", "audit_logs"]) expect(await count(m, t), t).toBe(1);
    expect(await count(m, "maintenance_tickets")).toBe(2);
    await as<{ full_name: string }>(m, async (q) => { expect((await q("SELECT full_name FROM tenants ORDER BY 1")).rows.map((r) => r.full_name)).toEqual(["A1", "A2"]); });
  });

  it("no settings and no JWT → zero rows everywhere (fails closed)", async () => {
    for (const t of TABLES) expect(await count({}, t), t).toBe(0);
  });

  it("the Supabase JWT path still works: auth.uid() alone resolves org and role through the profile", async () => {
    await db.query("INSERT INTO auth.fake_uid (uid) VALUES ($1)", [managerA]);
    try {
      expect(await count({}, "tenants")).toBe(2);
      expect(await count({}, "organisations")).toBe(1);
    } finally { await db.query("DELETE FROM auth.fake_uid"); }
  });

  it("a tenant login sees only themself: one tenant row, own charges, own repairs, no staff notes, no sessions, no audit", async () => {
    const t = { org: A, user: tenantUserA1, role: "tenant", tenant: tA1 };
    expect(await count(t, "tenants")).toBe(1);
    await as<{ full_name: string }>(t, async (q) => { expect((await q("SELECT full_name FROM tenants")).rows[0]!.full_name).toBe("A1"); });
    expect(await count(t, "service_charges")).toBe(1);
    expect(await count(t, "rent_payments")).toBe(1);
    expect(await count(t, "maintenance_tickets")).toBe(1);
    for (const x of ["sessions", "staff_notes", "communications", "audit_logs", "tenant_documents", "incident_reports", "shift_handovers", "agent_health"]) expect(await count(t, x), x).toBe(0);
    expect(await count(t, "profiles")).toBe(1); // only their own profile
  });

  it("writes are org-bound and role-gated: cannot insert into org B; a support worker cannot delete; a manager can", async () => {
    await expect(as({ org: A, user: managerA, role: "manager" }, (q) => q("INSERT INTO tenants (org_id, full_name) VALUES ($1, 'sneak')", [B]))).rejects.toThrow(/row-level security/);
    let deleted = -1;
    await as({ org: A, user: workerA, role: "support_worker" }, async (q) => { deleted = (await q("DELETE FROM tenants WHERE id = $1", [tA2])).rowCount ?? 0; });
    expect(deleted).toBe(0);
    await as({ org: A, user: managerA, role: "manager" }, async (q) => { deleted = (await q("DELETE FROM tenants WHERE id = $1", [tA2])).rowCount ?? 0; });
    expect(deleted).toBe(1);
  });

  it("drafts belong to their author; a manager cannot edit another worker's draft", async () => {
    expect(await count({ org: A, user: workerA, role: "support_worker" }, "drafts")).toBe(2); // read: whole org
    let updated = -1;
    await as({ org: A, user: managerA, role: "manager" }, async (q) => { updated = (await q("UPDATE drafts SET step = 2 WHERE created_by = $1", [workerA])).rowCount ?? 0; });
    expect(updated).toBe(0);
    await as({ org: A, user: workerA, role: "support_worker" }, async (q) => { updated = (await q("UPDATE drafts SET step = 2 WHERE created_by = $1", [workerA])).rowCount ?? 0; });
    expect(updated).toBe(1);
  });

  it("settings are readable by any signed-in caller and agent health by staff only", async () => {
    expect(await count({ org: A, user: workerA, role: "support_worker" }, "settings")).toBe(1);
    expect(await count({ org: A, user: workerA, role: "support_worker" }, "agent_health")).toBe(1);
    expect(await count({}, "settings")).toBe(0);
  });
});
