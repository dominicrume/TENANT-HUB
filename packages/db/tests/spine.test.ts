import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createPgliteClient } from "./pglite";

const root = (() => { let d = path.resolve(__dirname); while (!fs.existsSync(path.join(d, "pnpm-workspace.yaml"))) d = path.dirname(d); return d; })();
const sql = (f: string) => fs.readFileSync(path.join(root, "supabase/migrations", f), "utf-8").replace(/NOTIFY pgrst[^;]*;/g, "");

/** Minimal pre-033 world: two organisations, tenants in rooms at two addresses, brand settings, the 032 helpers. */
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
INSERT INTO settings (brand, service_charge_default) VALUES ('mattys_place', 150), ('reliance', 25);
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION get_my_org_id() RETURNS UUID AS $$ SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1; $$ LANGUAGE sql STABLE SECURITY DEFINER;
CREATE OR REPLACE FUNCTION get_my_role() RETURNS user_role AS $$ SELECT role FROM profiles WHERE id = auth.uid(); $$ LANGUAGE sql STABLE SECURITY DEFINER;
CREATE ROLE app_web NOLOGIN; GRANT USAGE ON SCHEMA public, auth TO app_web;
`;
// Tables 032 touches that this stub does not need; created empty so 032 applies.
const REST = ["sessions(id UUID, tenant_id UUID)", "service_charges(id UUID, tenant_id UUID)", "rent_payments(id UUID, tenant_id UUID)", "intake_checklists(id UUID, tenant_id UUID)",
  "audit_logs(id UUID, tenant_id UUID, org_id UUID, user_id UUID)", "stamp_queue(id UUID, tenant_id UUID)", "drafts(id UUID, created_by UUID)", "form_templates(id UUID, org_id UUID)",
  "tenant_forms(id UUID, tenant_id UUID)", "maintenance_tickets(id UUID, org_id UUID, tenant_id UUID)", "tenant_documents(id UUID, tenant_id UUID)", "incident_reports(id UUID, org_id UUID)",
  "shift_handovers(id UUID, org_id UUID)", "communications_log(id UUID, org_id UUID)", "staff_notes(id UUID, org_id UUID)", "communications(id UUID, org_id UUID)",
  "tenant_goals(id UUID, tenant_id UUID)", "tenant_goal_updates(id UUID, goal_id UUID)", "agent_health(agent TEXT)"];

describe("033_property_spine.sql", () => {
  let db: Awaited<ReturnType<typeof createPgliteClient>>;
  let A: string, B: string, amina: string, ben: string, cara: string;
  beforeAll(async () => {
    db = await createPgliteClient();
    await db.raw.exec(STUB + REST.map((t) => `CREATE TABLE ${t};`).join("\n"));
    await db.raw.exec(sql("032_rls_request_settings.sql"));
    A = (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ('A') RETURNING id")).rows[0]!.id;
    B = (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ('B') RETURNING id")).rows[0]!.id;
    const ins = async (org: string, name: string, address: string, pc: string, room: string, active = true, brand = "mattys_place") =>
      (await db.query<{ id: string }>("INSERT INTO tenants (org_id, full_name, address, postcode, room_number, moved_in, is_active, brand) VALUES ($1,$2,$3,$4,$5,'2026-01-10',$6,$7) RETURNING id", [org, name, address, pc, room, active, brand])).rows[0]!.id;
    amina = await ins(A, "Amina", "14 Ravenhurst St", "B12 8AA", "Room 4");
    ben = await ins(A, "Ben", "14 Ravenhurst St", "B12 8AA", "Room 2");
    cara = await ins(A, "Cara", "9 Sparkhill Rd", "B11 4QQ", "Room 1", true, "reliance");
    await ins(A, "Dan (left)", "9 Sparkhill Rd", "B11 4QQ", "Room 3", false);
    await ins(B, "Eve", "1 Other Lane", "M1 1AA", "Room 1");
    await db.raw.exec("GRANT ALL ON ALL TABLES IN SCHEMA public TO app_web; GRANT SELECT ON auth.fake_uid TO app_web;");
    await db.raw.exec(sql("033_property_spine.sql"));
    await db.raw.exec("GRANT ALL ON ALL TABLES IN SCHEMA public TO app_web;");
  });
  afterAll(async () => { await db.end(); });

  it("backfills a home per address, a room per room number, an active tenancy per active tenant, rent from the brand default", async () => {
    const props = (await db.query<{ org_id: string; name: string; postcode: string }>("SELECT org_id, name, postcode FROM properties ORDER BY name")).rows;
    expect(props.map((p) => p.name)).toEqual(["1 Other Lane", "14 Ravenhurst St", "9 Sparkhill Rd"]);
    expect(Number((await db.query<{ n: string | number }>("SELECT count(*) n FROM units")).rows[0]!.n)).toBe(5);
    const ten = (await db.query<{ full_name: string; reference: string; rent_amount: string | number; status: string }>(
      "SELECT tn.full_name, u.reference, t.rent_amount, u.status FROM tenancies t JOIN tenants tn ON tn.id = t.tenant_id JOIN units u ON u.id = t.unit_id ORDER BY tn.full_name")).rows;
    expect(ten.map((r) => [r.full_name, r.reference, Number(r.rent_amount), r.status])).toEqual([
      ["Amina", "Room 4", 150, "occupied"], ["Ben", "Room 2", 150, "occupied"], ["Cara", "Room 1", 25, "occupied"], ["Eve", "Room 1", 150, "occupied"]]);
    expect((await db.query<{ status: string }>("SELECT status FROM units WHERE reference = 'Room 3'")).rows[0]!.status).toBe("vacant"); // Dan left
  });

  it("is idempotent: a second run creates nothing", async () => {
    const before = (await db.query<{ p: string; u: string; t: string }>("SELECT (SELECT count(*) FROM properties) p, (SELECT count(*) FROM units) u, (SELECT count(*) FROM tenancies) t")).rows[0];
    await db.raw.exec(sql("033_property_spine.sql"));
    const after = (await db.query<{ p: string; u: string; t: string }>("SELECT (SELECT count(*) FROM properties) p, (SELECT count(*) FROM units) u, (SELECT count(*) FROM tenancies) t")).rows[0];
    expect(after).toEqual(before);
  });

  it("enforces one active tenancy per tenant and per unit", async () => {
    const unit = (await db.query<{ unit_id: string }>("SELECT unit_id FROM tenancies WHERE tenant_id = $1", [ben])).rows[0]!.unit_id;
    await expect(db.query("INSERT INTO tenancies (org_id, unit_id, tenant_id) VALUES ($1, $2, $3)", [A, unit, cara])).rejects.toThrow();
    const otherUnit = (await db.query<{ id: string }>("INSERT INTO units (org_id, property_id, reference) SELECT $1, id, 'Room 99' FROM properties WHERE name = '14 Ravenhurst St' RETURNING id", [A])).rows[0]!.id;
    await expect(db.query("INSERT INTO tenancies (org_id, unit_id, tenant_id) VALUES ($1, $2, $3)", [A, otherUnit, amina])).rejects.toThrow();
  });

  it("RLS: staff see their organisation's homes only; a tenant sees only where they live", async () => {
    const as = async (scope: Record<string, string>, q: string) => db.transaction(async (tx) => {
      await tx.query("SET LOCAL ROLE app_web");
      for (const [k, v] of Object.entries(scope)) await tx.query(`SELECT set_config('app.${k}', $1, true)`, [v]);
      return Number((await tx.query<{ n: string | number }>(q)).rows[0]!.n);
    });
    expect(await as({ current_org: A, current_role: "manager" }, "SELECT count(*) n FROM properties")).toBe(2);
    expect(await as({ current_org: A, current_role: "manager" }, "SELECT count(*) n FROM units")).toBe(5);
    expect(await as({ current_org: B, current_role: "manager" }, "SELECT count(*) n FROM tenancies")).toBe(1);
    expect(await as({ current_org: A, current_role: "tenant", current_tenant: amina }, "SELECT count(*) n FROM properties")).toBe(1);
    expect(await as({ current_org: A, current_role: "tenant", current_tenant: amina }, "SELECT count(*) n FROM units")).toBe(1);
    expect(await as({ current_org: A, current_role: "tenant", current_tenant: amina }, "SELECT count(*) n FROM tenancies")).toBe(1);
    expect(await as({}, "SELECT count(*) n FROM properties")).toBe(0);
  });
});
