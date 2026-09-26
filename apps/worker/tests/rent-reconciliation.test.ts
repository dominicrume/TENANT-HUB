import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { DbClient, Queryable } from "@tenant-hub/db";
import { SimBankFeed } from "@tenant-hub/adapters";
import {
  addPeriod, referenceScore, amountScore, matchConfidence, bestMatch, rentReconciliation, PERIOD_LABEL, type ExpectedCharge,
} from "../src/agents/rent-reconciliation";
import type { AgentContext } from "../src/registry";

/* ── Pure helpers ─────────────────────────────────────────────────────────── */

describe("addPeriod", () => {
  it("steps weekly/fortnightly/four-weekly by days, and monthly/quarterly by calendar months", () => {
    const d = new Date("2026-01-31T00:00:00Z");
    expect(addPeriod(d, "weekly").toISOString().slice(0, 10)).toBe("2026-02-07");
    expect(addPeriod(d, "fortnightly").toISOString().slice(0, 10)).toBe("2026-02-14");
    expect(addPeriod(d, "four_weekly").toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addPeriod(d, "monthly").toISOString().slice(0, 10)).toBe("2026-03-03"); // JS Date rolls over Feb having fewer days than 31 — a known, accepted quirk
    expect(addPeriod(new Date("2026-01-15T00:00:00Z"), "quarterly").toISOString().slice(0, 10)).toBe("2026-04-15");
  });
  it("every frequency has a plain-words label", () => {
    for (const label of Object.values(PERIOD_LABEL)) expect(label).toMatch(/charge$/);
  });
});

describe("referenceScore / amountScore / matchConfidence", () => {
  it("a full reference match scores 1; a first-word-only fragment scores 0.4; no overlap scores 0", () => {
    expect(referenceScore("RENT KHAN ROOM 4", "KHAN ROOM 4")).toBe(1);
    expect(referenceScore("KHAN PART", "KHAN ROOM 4")).toBe(0.4);
    expect(referenceScore("SOMETHING ELSE", "KHAN ROOM 4")).toBe(0);
  });
  it("amount within 1% scores 1; within 10% scores 0.5; further off scores 0.1; zero expected scores 0", () => {
    expect(amountScore(150, 150)).toBe(1);
    expect(amountScore(148.6, 150)).toBe(1);
    expect(amountScore(140, 150)).toBe(0.5);
    expect(amountScore(75, 150)).toBe(0.1);
    expect(amountScore(10, 0)).toBe(0);
  });
  it("a clean transaction (full reference, exact amount) scores 1.0 — comfortably confirmed; a half-paid, partly-referenced one scores well under the threshold", () => {
    const expected = { amount: 150, reference: "KHAN ROOM 4" };
    expect(matchConfidence({ amount: 150, reference: "RENT KHAN ROOM 4" }, expected)).toBe(1);
    expect(matchConfidence({ amount: 75, reference: "KHAN PART" }, expected)).toBeLessThan(0.5);
  });
});

describe("bestMatch", () => {
  const expected: ExpectedCharge[] = [
    { tenancyId: "t1", tenantId: "u1", tenantName: "Amina Khan", reference: "KHAN ROOM 4", amount: 150, dueDate: "2026-09-20" },
    { tenancyId: "t2", tenantId: "u2", tenantName: "Ben Osei", reference: "OSEI ROOM 2", amount: 150, dueDate: "2026-09-21" },
  ];
  it("picks the highest-scoring expected charge, not just the first one", () => {
    const m = bestMatch({ externalId: "x", amount: 150, postedOn: "2026-09-22", reference: "RENT OSEI ROOM 2" }, expected);
    expect(m?.charge.tenantName).toBe("Ben Osei");
    expect(m?.confidence).toBe(1);
  });
  it("returns null when nothing in the reference resembles any expected charge, however close the amount is", () => {
    // £150 happens to equal every expected amount here — an amount coincidence alone must never be enough.
    expect(bestMatch({ externalId: "x", amount: 150, postedOn: "2026-09-22", reference: "UNRELATED PAYMENT" }, expected)).toBeNull();
  });
});

/* ── The agent, end to end on pglite ─────────────────────────────────────── */

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
const MIGRATIONS = ["031_agent_runtime.sql", "032_rls_request_settings.sql", "033_property_spine.sql", "034_money_and_arrears.sql", "039_rent_reconciliation.sql"];

async function pgliteClient(): Promise<DbClient & { raw: PGlite }> {
  const pg = new PGlite(); await pg.waitReady;
  const wrap = (q: { query: PGlite["query"] }): Queryable => ({
    async query<T>(sql: string, params?: unknown[]) { const r = await q.query<T>(sql, params as unknown[]); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }; },
  });
  return { ...wrap(pg), transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))), end: () => pg.close(), raw: pg };
}

const isoDaysAgo = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const count = async (db: DbClient, sql: string, params: unknown[] = []) => Number((await db.query<{ n: string | number }>(sql, params)).rows[0]!.n);

describe("rentReconciliation, end to end", () => {
  let db: Awaited<ReturnType<typeof pgliteClient>>;

  beforeAll(async () => {
    db = await pgliteClient();
    await db.raw.exec(PREREQ + REST.map((t) => `CREATE TABLE ${t};`).join("\n"));
    for (const m of MIGRATIONS) await db.raw.exec(migration(m));
  });
  afterAll(async () => { await db.end(); });

  /** Every scenario gets its own organisation: the bank feed's odd/even freshness alternation depends on
   *  every OTHER active tenancy's fresh charges in the same org, so sharing one org across scenarios would
   *  make each test's outcome depend on execution order. */
  async function makeOrg(name: string) {
    return (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ($1) RETURNING id", [name])).rows[0]!.id;
  }
  async function makeTenancy(org: string, fullName: string, room: string, rentAmount: number, startDaysAgo: number, frequency: "weekly" | "monthly" = "weekly") {
    const tenant = (await db.query<{ id: string }>("INSERT INTO tenants (org_id, full_name, moved_in) VALUES ($1, $2, CURRENT_DATE) RETURNING id", [org, fullName])).rows[0]!.id;
    const property = (await db.query<{ id: string }>("INSERT INTO properties (org_id, name, asset_class) VALUES ($1, $2, 'supported') RETURNING id", [org, `${fullName}'s home`])).rows[0]!.id;
    const unit = (await db.query<{ id: string }>("INSERT INTO units (org_id, property_id, reference, unit_class) VALUES ($1, $2, $3, 'supported') RETURNING id", [org, property, room])).rows[0]!.id;
    const tenancy = (await db.query<{ id: string }>(
      "INSERT INTO tenancies (org_id, unit_id, tenant_id, rent_amount, rent_frequency, start_date, status) VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id",
      [org, unit, tenant, rentAmount, frequency, isoDaysAgo(startDaysAgo)])).rows[0]!.id;
    return { tenantId: tenant, tenancyId: tenancy };
  }
  const ctx = (org: string, correlationId: string): AgentContext => ({ client: db, orgId: org, correlationId, payload: {} });

  it("generates every due charge from the tenancy's start date up to today, catching up in one run, and nothing further on a same-day re-run", async () => {
    const org = await makeOrg("Charge Generation");
    const { tenancyId } = await makeTenancy(org, "Amina Khan", "Room 4", 150, 22); // 22 days ago, weekly → due at 22, 15, 8, 1 days ago = 4 charges
    await rentReconciliation(ctx(org, "cid-gen-1"));
    const rows = (await db.query<{ due_date: string; amount: string; week_label: string }>(
      "SELECT due_date::text AS due_date, amount, week_label FROM service_charges WHERE tenancy_id = $1 ORDER BY due_date", [tenancyId])).rows;
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => Number(r.amount) === 150 && r.week_label === "Weekly charge")).toBe(true);
    await rentReconciliation(ctx(org, "cid-gen-2"));
    expect(await count(db, "SELECT count(*) n FROM service_charges WHERE tenancy_id = $1", [tenancyId])).toBe(4);
  });

  it("skips a tenancy with no rent amount, and does nothing for an organisation with no tenancies at all", async () => {
    const org = await makeOrg("Zero Rent");
    await makeTenancy(org, "Zero Rent Tenant", "Room 9", 0, 10);
    await expect(rentReconciliation(ctx(org, "cid-zero"))).resolves.toBeUndefined();
    expect(await count(db, "SELECT count(*) n FROM service_charges WHERE tenant_id IN (SELECT id FROM tenants WHERE org_id = $1)", [org])).toBe(0);
    const empty = await makeOrg("No Tenancies");
    await expect(rentReconciliation(ctx(empty, "cid-empty"))).resolves.toBeUndefined();
  });

  describe("a clean bank match vs a weak one — same org across three chained scenarios, so the odd/even alternation is fully deterministic", () => {
    let org: string, cara: Awaited<ReturnType<typeof makeTenancy>>, dan: Awaited<ReturnType<typeof makeTenancy>>;

    it("sets up two fresh, weekly, £150 tenancies — SimBankFeed will treat exactly one of the two as a clean match and the other as a weak half-payment, by (due date, reference) order", async () => {
      org = await makeOrg("Bank Matching");
      // Both due dates stay well inside SimBankFeed's 0–3-day freshness window regardless of what time of
      // day the test runs (its age check uses the current full timestamp, not a midnight-normalised "today",
      // so an offset of exactly 3 days can drift outside the window by a few hours — 0 and 1 never can).
      // Dan's charge is due one day earlier than Cara's, so it sorts first → SimBankFeed marks it CLEAN (even index); Cara's sorts second → WEAK (odd index).
      dan = await makeTenancy(org, "Dan Okafor", "Room 8", 150, 1);
      cara = await makeTenancy(org, "Cara Lee", "Room 7", 150, 0);
      await rentReconciliation(ctx(org, "cid-bank-setup"));
      expect(await count(db, "SELECT count(*) n FROM service_charges WHERE tenant_id IN ($1, $2)", [dan.tenantId, cara.tenantId])).toBe(2);
    });

    it("records Dan's clean match as a full £150 payment, and NEVER writes Cara's weak match as a payment — it goes to rent_unmatched at well under the 0.95 threshold (H9)", async () => {
      const danPayments = (await db.query<{ amount: string }>("SELECT amount FROM rent_payments WHERE tenant_id = $1", [dan.tenantId])).rows;
      expect(danPayments).toHaveLength(1);
      expect(Number(danPayments[0]!.amount)).toBe(150);

      const caraPayments = await count(db, "SELECT count(*) n FROM rent_payments WHERE tenant_id = $1", [cara.tenantId]);
      expect(caraPayments).toBe(0); // the hard guarantee: a weak match is never written as a payment

      const caraUnmatched = (await db.query<{ confidence: string; amount: string; status: string }>(
        "SELECT confidence, amount, status FROM rent_unmatched WHERE org_id = $1 AND tenant_id = $2", [org, cara.tenantId])).rows;
      expect(caraUnmatched).toHaveLength(1);
      expect(Number(caraUnmatched[0]!.confidence)).toBeLessThan(0.95);
      expect(Number(caraUnmatched[0]!.amount)).toBeCloseTo(75, 1);
      expect(caraUnmatched[0]!.status).toBe("pending");
    });

    it("is idempotent for the bank feed: re-running twice more does not duplicate Dan's payment or Cara's unmatched row", async () => {
      await rentReconciliation(ctx(org, "cid-bank-2"));
      await rentReconciliation(ctx(org, "cid-bank-3"));
      expect(await count(db, "SELECT count(*) n FROM rent_payments WHERE tenant_id = $1", [dan.tenantId])).toBe(1);
      expect(await count(db, "SELECT count(*) n FROM rent_unmatched WHERE org_id = $1 AND tenant_id = $2", [org, cara.tenantId])).toBe(1);
    });

    it("every write carries the rent-reconciliation receipt with no human actor, and Cara's weak match left a ✋ refusal on the receipt", async () => {
      const paymentAudit = (await db.query<{ agent: string; user_id: string | null }>(
        "SELECT agent, user_id FROM audit_logs WHERE table_name = 'rent_payments' AND tenant_id = $1 LIMIT 1", [dan.tenantId])).rows[0]!;
      expect(paymentAudit.agent).toBe("rent-reconciliation");
      expect(paymentAudit.user_id).toBeNull();

      const unmatchedAudit = (await db.query<{ refusals: unknown }>(
        "SELECT refusals FROM audit_logs WHERE table_name = 'rent_unmatched' AND tenant_id = $1 ORDER BY created_at DESC LIMIT 1", [cara.tenantId])).rows[0]!;
      expect(unmatchedAudit.refusals).toEqual(expect.arrayContaining([expect.objectContaining({ attempted: "mark_paid_on_weak_match" })]));
    });
  });

  it("SimBankFeed itself never returns a transaction it wasn't asked about, so this agent's matching has real signal to work with", async () => {
    const feed = new SimBankFeed();
    const result = await feed.transactions([{ tenancyId: "x", reference: "TEST ROOM 1", amount: 150, dueDate: isoDaysAgo(1) }], isoDaysAgo(14));
    expect(result.data).toHaveLength(1);
    expect(result.mode).toBe("simulated");
  });
});
