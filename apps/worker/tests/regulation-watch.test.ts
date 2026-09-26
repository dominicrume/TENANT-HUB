import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { DbClient, Queryable } from "@tenant-hub/db";
import type { RegulationFeedPort, RegulationItem, AdapterResult } from "@tenant-hub/ports";
import { regulationWatch } from "../src/agents/regulation-watch";
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

/** A fake feed that never touches the network — this is what makes the classification and mapping testable without legislation.gov.uk. */
function fakeFeed(items: RegulationItem[]): RegulationFeedPort {
  return { mode: "simulated", async poll(): Promise<AdapterResult<RegulationItem[]>> { return { data: items, mode: "simulated", source: "fake:regulation", retrievedAt: new Date().toISOString() }; } };
}
const unreachableFeed: RegulationFeedPort = { mode: "live", async poll() { throw new Error("legislation.gov.uk unreachable"); } };

describe("regulation-watch", () => {
  let db: Awaited<ReturnType<typeof pgliteClient>>;
  let org: string, ctx: AgentContext;

  beforeAll(async () => {
    db = await pgliteClient();
    await db.raw.exec(PREREQ + REST.map((t) => `CREATE TABLE ${t};`).join("\n"));
    for (const m of ["031_agent_runtime.sql", "032_rls_request_settings.sql", "033_property_spine.sql", "036_regulation_repairs.sql"]) {
      await db.raw.exec(migration(m));
    }
    org = (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ('Matty''s Place') RETURNING id")).rows[0]!.id;
    ctx = { client: db, orgId: org, correlationId: "cid-1", payload: {} };
  });
  afterAll(async () => { await db.end(); });

  async function makeProperty(name: string, assetClass: string, unitClasses: string[] = []) {
    const id = (await db.query<{ id: string }>("INSERT INTO properties (org_id, name, asset_class) VALUES ($1, $2, $3) RETURNING id", [org, name, assetClass])).rows[0]!.id;
    for (const [i, uc] of unitClasses.entries()) await db.query("INSERT INTO units (property_id, org_id, unit_class, reference) VALUES ($1, $2, $3, $4)", [id, org, uc, `Room ${i + 1}`]);
    return id;
  }
  const impactsFor = async (externalId: string) =>
    (await db.query<{ property_id: string }>(
      "SELECT ri.property_id FROM regulation_impacts ri JOIN regulation_items i ON i.id = ri.regulation_item_id WHERE i.org_id = $1 AND i.external_id = $2", [org, externalId])).rows;
  const itemByExternalId = async (externalId: string) =>
    (await db.query<{ applies_to: string; confidence: string | null }>("SELECT applies_to, confidence::text AS confidence FROM regulation_items WHERE org_id = $1 AND external_id = $2", [org, externalId])).rows[0];

  it("records a housing-irrelevant item as unknown, and never maps it to any property", async () => {
    const supported = await makeProperty("14 Ravenhurst St", "supported");
    await regulationWatch({ ...ctx, correlationId: "cid-a" }, fakeFeed([
      { externalId: "leg-traffic-1", title: "The Road Traffic (Amendment) Regulations", url: "https://example/1", publishedOn: "2026-01-01", excerpt: "Speed limits on trunk roads." },
    ]));
    expect(await itemByExternalId("leg-traffic-1")).toMatchObject({ applies_to: "unknown", confidence: null });
    expect(await impactsFor("leg-traffic-1")).toHaveLength(0);
    void supported;
  });

  it("maps a supported-housing item only to the supported property, not to a residential or commercial one", async () => {
    const supported = await makeProperty("Supported House", "supported");
    const residential = await makeProperty("Residential House", "residential");
    await regulationWatch({ ...ctx, correlationId: "cid-b" }, fakeFeed([
      { externalId: "leg-supported-1", title: "Supported Housing (Regulatory Oversight) Act", url: "https://example/2", publishedOn: "2026-01-02", excerpt: "" },
    ]));
    const impacts = await impactsFor("leg-supported-1");
    const propertyIds = impacts.map((i) => i.property_id);
    expect(propertyIds).toContain(supported);
    expect(propertyIds).not.toContain(residential);
  });

  it("maps a fire-safety item to 'all' — every property, including a mixed one by its unit classes", async () => {
    const mixed = await makeProperty("Mixed Block", "mixed", ["supported", "commercial"]);
    await regulationWatch({ ...ctx, correlationId: "cid-c" }, fakeFeed([
      { externalId: "leg-fire-1", title: "The Fire Safety (England) Regulations 2026", url: "https://example/3", publishedOn: "2026-01-03", excerpt: "" },
    ]));
    const propertyIds = (await impactsFor("leg-fire-1")).map((i) => i.property_id);
    expect(propertyIds).toContain(mixed);
  });

  it("is idempotent: polling the same external id twice never records it twice", async () => {
    const feed = fakeFeed([{ externalId: "leg-repeat-1", title: "Supported Housing Act", url: "https://example/4", publishedOn: "2026-01-04", excerpt: "" }]);
    await regulationWatch({ ...ctx, correlationId: "cid-d1" }, feed);
    await regulationWatch({ ...ctx, correlationId: "cid-d2" }, feed);
    const count = (await db.query<{ n: string | number }>("SELECT count(*) n FROM regulation_items WHERE org_id = $1 AND external_id = 'leg-repeat-1'", [org])).rows[0]!.n;
    expect(Number(count)).toBe(1);
  });

  it("ends the run quietly when the feed is unreachable — nothing is recorded, and the source's cursor is untouched", async () => {
    const before = (await db.query<{ last_polled_at: string | null }>("SELECT last_polled_at::text AS last_polled_at FROM regulation_sources WHERE org_id = $1", [org])).rows[0]!.last_polled_at;
    await expect(regulationWatch({ ...ctx, correlationId: "cid-e" }, unreachableFeed)).resolves.toBeUndefined();
    const after = (await db.query<{ last_polled_at: string | null }>("SELECT last_polled_at::text AS last_polled_at FROM regulation_sources WHERE org_id = $1", [org])).rows[0]!.last_polled_at;
    expect(after).toBe(before);
  });

  it("records the no-human-actor receipt", async () => {
    const logs = (await db.query<{ user_id: string | null; agent: string | null }>(
      "SELECT user_id, agent FROM audit_logs WHERE table_name = 'regulation_items' ORDER BY created_at DESC LIMIT 1")).rows;
    expect(logs[0]).toMatchObject({ user_id: null, agent: "regulation-watch" });
  });
});
