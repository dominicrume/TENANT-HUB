import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { DbClient, Queryable } from "@tenant-hub/db";
import { issueTriage } from "../src/agents/issue-triage";
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
const MIGRATIONS = ["031_agent_runtime.sql", "032_rls_request_settings.sql", "033_property_spine.sql", "034_money_and_arrears.sql", "036_regulation_repairs.sql"];

async function pgliteClient(): Promise<DbClient & { raw: PGlite }> {
  const pg = new PGlite(); await pg.waitReady;
  const wrap = (q: { query: PGlite["query"] }): Queryable => ({
    async query<T>(sql: string, params?: unknown[]) { const r = await q.query<T>(sql, params as unknown[]); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }; },
  });
  return { ...wrap(pg), transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))), end: () => pg.close(), raw: pg };
}

const count = async (db: DbClient, sql: string, params: unknown[] = []) => Number((await db.query<{ n: string | number }>(sql, params)).rows[0]!.n);

describe("issueTriage, end to end", () => {
  let db: Awaited<ReturnType<typeof pgliteClient>>;

  beforeAll(async () => {
    db = await pgliteClient();
    await db.raw.exec(PREREQ + REST.map((t) => `CREATE TABLE ${t};`).join("\n"));
    for (const m of MIGRATIONS) await db.raw.exec(migration(m));
  });
  afterAll(async () => { await db.end(); });
  // No AI provider key in this test process — every scenario exercises the rules-based classifier deterministically.
  beforeEach(() => { for (const k of ["AZURE_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "XAI_API_KEY", "RUNCRATE_API_KEY"]) delete process.env[k]; });

  async function makeOrg(name: string) { return (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ($1) RETURNING id", [name])).rows[0]!.id; }
  async function makeTrade(org: string, category: string, emergencyCapable: boolean) {
    return (await db.query<{ id: string }>(
      "INSERT INTO trades (org_id, name, category, contact_email, is_emergency_capable) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [org, `${category} co`, category, `${category}@example.org`, emergencyCapable])).rows[0]!.id;
  }
  async function makeTicket(org: string, rawReport: string, reportedVia = "portal") {
    return (await db.query<{ id: string }>(
      "INSERT INTO maintenance_tickets (org_id, room_number, issue_type, description, raw_report, reported_via, status) VALUES ($1, 'Room 1', 'General', $2, $2, $3, 'Open') RETURNING id",
      [org, rawReport, reportedVia])).rows[0]!.id;
  }
  const ctx = (org: string, correlationId: string, issueId?: string): AgentContext => ({ client: db, orgId: org, correlationId, payload: issueId ? { issueId } : {} });
  const ticketState = (id: string) => db.query<{ category: string; severity: string; status: string; triage_reasoning: string; triaged_at: string | null }>(
    "SELECT category, severity, status, triage_reasoning, triaged_at FROM maintenance_tickets WHERE id = $1", [id]).then((r) => r.rows[0]!);

  it("auto-dispatches an emergency when a 24/7-capable trade is on file, moving status to In Progress", async () => {
    const org = await makeOrg("Auto Dispatch");
    await makeTrade(org, "plumbing", true);
    const ticket = await makeTicket(org, "There is a flood coming from under the kitchen sink");
    await issueTriage(ctx(org, "cid-1"));
    const state = await ticketState(ticket);
    expect(state).toMatchObject({ category: "plumbing", severity: "emergency", status: "In Progress" });
    expect(state.triaged_at).not.toBeNull();
    const job = (await db.query<{ dispatched_at: string | null }>("SELECT dispatched_at FROM dispatch_jobs WHERE ticket_id = $1", [ticket])).rows[0]!;
    expect(job.dispatched_at).not.toBeNull();
  });

  it("H9: never auto-dispatches an emergency when no 24/7-capable trade exists — proposes instead and leaves status alone", async () => {
    const org = await makeOrg("No Emergency Trade");
    await makeTrade(org, "electrical", false); // on file, but not 24/7
    const ticket = await makeTicket(org, "I can see sparks coming from the light switch");
    await issueTriage(ctx(org, "cid-1"));
    const state = await ticketState(ticket);
    expect(state).toMatchObject({ category: "electrical", severity: "emergency", status: "Open" }); // untouched — no trade auto-dispatched
    const job = (await db.query<{ dispatched_at: string | null; trade_id: string | null }>("SELECT dispatched_at, trade_id FROM dispatch_jobs WHERE ticket_id = $1", [ticket])).rows[0]!;
    expect(job.dispatched_at).toBeNull();
    expect(job.trade_id).not.toBeNull(); // still names the best-guess trade for a person to confirm
    const refusal = (await db.query<{ refusals: unknown }>("SELECT refusals FROM audit_logs WHERE table_name = 'dispatch_jobs' AND record_id = (SELECT id FROM dispatch_jobs WHERE ticket_id = $1) ORDER BY created_at DESC LIMIT 1", [ticket])).rows[0]!;
    expect(refusal.refusals).toEqual(expect.arrayContaining([expect.objectContaining({ attempted: "auto_dispatch_non_emergency" })]));
  });

  it("never auto-dispatches a non-emergency, however capable the trade", async () => {
    const org = await makeOrg("Non Emergency");
    await makeTrade(org, "heating", true); // 24/7-capable, but the issue itself isn't an emergency
    const ticket = await makeTicket(org, "Boiler fault, not working properly");
    await issueTriage(ctx(org, "cid-1"));
    const state = await ticketState(ticket);
    expect(state).toMatchObject({ category: "heating", severity: "urgent", status: "Open" });
    const job = (await db.query<{ dispatched_at: string | null }>("SELECT dispatched_at FROM dispatch_jobs WHERE ticket_id = $1", [ticket])).rows[0]!;
    expect(job.dispatched_at).toBeNull();
  });

  it("falls back to the general trade when no trade matches the classified category", async () => {
    const org = await makeOrg("General Fallback");
    await makeTrade(org, "general", false);
    const ticket = await makeTicket(org, "There's a scuff mark on the hallway wall"); // cosmetic, category general
    await issueTriage(ctx(org, "cid-1"));
    const job = (await db.query<{ trade_id: string | null }>("SELECT trade_id FROM dispatch_jobs WHERE ticket_id = $1", [ticket])).rows[0]!;
    expect(job.trade_id).not.toBeNull();
  });

  it("transcribes a voice report through the (simulated) speech-to-text adapter before classifying", async () => {
    const org = await makeOrg("Voice Report");
    const ticket = await makeTicket(org, "There's a strong smell of gas in the kitchen", "voice");
    await issueTriage(ctx(org, "cid-1"));
    const t = (await db.query<{ transcript: string | null; severity: string }>("SELECT transcript, severity FROM maintenance_tickets WHERE id = $1", [ticket])).rows[0]!;
    expect(t.transcript).toBe("There's a strong smell of gas in the kitchen"); // SimStt echoes the hint
    expect(t.severity).toBe("emergency");
  });

  it("is idempotent: a triaged ticket (severity set) is never re-selected on a later run", async () => {
    const org = await makeOrg("Idempotent");
    const ticket = await makeTicket(org, "There's a scuff mark on the hallway wall");
    await issueTriage(ctx(org, "cid-1"));
    const before = await ticketState(ticket);
    await issueTriage(ctx(org, "cid-2"));
    const after = await ticketState(ticket);
    expect(String(after.triaged_at)).toBe(String(before.triaged_at));
    expect(await count(db, "SELECT count(*) n FROM dispatch_jobs WHERE ticket_id = $1", [ticket])).toBe(1);
  });

  it("triages a single named ticket when an issueId is given, ignoring every other 'new' ticket in the org", async () => {
    const org = await makeOrg("Single Ticket");
    const a = await makeTicket(org, "There's a scuff mark on the hallway wall");
    const b = await makeTicket(org, "There's a strong smell of gas in the kitchen");
    await issueTriage(ctx(org, "cid-1", a));
    expect((await ticketState(a)).severity).toBe("cosmetic");
    expect((await ticketState(b)).severity).toBeNull(); // untouched
  });

  it("every write carries the issue-triage receipt with no human actor", async () => {
    const org = await makeOrg("Receipt Check");
    const ticket = await makeTicket(org, "There's a scuff mark on the hallway wall");
    await issueTriage(ctx(org, "cid-1"));
    const row = (await db.query<{ agent: string; user_id: string | null }>(
      "SELECT agent, user_id FROM audit_logs WHERE table_name = 'maintenance_tickets' AND record_id = $1 ORDER BY created_at DESC LIMIT 1", [ticket])).rows[0]!;
    expect(row.agent).toBe("issue-triage");
    expect(row.user_id).toBeNull();
  });

  it("does nothing for an organisation with no tickets", async () => {
    const org = await makeOrg("Empty");
    await expect(issueTriage(ctx(org, "cid-empty"))).resolves.toBeUndefined();
  });
});
