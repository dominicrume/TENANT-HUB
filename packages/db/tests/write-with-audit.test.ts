import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildCanonicalString, GENESIS_HASH } from "@tenant-hub/audit";
import { createPgliteClient } from "./pglite";
import { writeWithAudit, _resetColumnCacheForTests } from "../src/write-with-audit";

/** The slice of the real schema the write path touches (001 + 023), on a real Postgres in-process. */
const SCHEMA = `
CREATE TYPE audit_action AS ENUM ('CREATE','UPDATE','DELETE','VERIFY','SIGN','EXPORT','LOGIN');
CREATE TYPE stamp_status AS ENUM ('pending','processing','done','failed','dead_letter');
CREATE TABLE tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY, full_name TEXT NOT NULL, room_number TEXT, nino TEXT,
  is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE service_charges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id UUID REFERENCES tenants(id) NOT NULL,
  week_label TEXT NOT NULL, due_date DATE NOT NULL, amount NUMERIC(10,2) NOT NULL DEFAULT 150.00,
  is_paid BOOLEAN DEFAULT FALSE, paid_date DATE, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE drafts (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, machine_state JSONB NOT NULL, step INTEGER NOT NULL DEFAULT 1);
CREATE TABLE audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id UUID, action audit_action NOT NULL, table_name TEXT NOT NULL,
  record_id UUID, user_id UUID, user_name TEXT, user_role TEXT, entry_method TEXT, prev_hash TEXT NOT NULL,
  blockchain_hash TEXT NOT NULL, record_snapshot JSONB, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE stamp_queue (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id UUID, audit_hash TEXT NOT NULL,
  status stamp_status DEFAULT 'pending', retry_count INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE FUNCTION deny_update_delete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
`;

const actor = { user_id: "11111111-1111-1111-1111-111111111111", user_name: "Test Manager", user_role: "manager" };

describe("writeWithAudit on pg", () => {
  let db: Awaited<ReturnType<typeof createPgliteClient>>;
  beforeAll(async () => { db = await createPgliteClient(); await db.raw.exec(SCHEMA); });
  afterAll(async () => { await db.end(); });
  beforeEach(() => _resetColumnCacheForTests());

  it("creates the record, the audit row and the stamp in one go, preserving defaults", async () => {
    const { data, audit_hash } = await writeWithAudit({ client: db, table: "tenants", action: "CREATE", ...actor,
      record: { full_name: "Amina Khan", room_number: "4" } });
    expect(data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.is_active).toBe(true); // DEFAULT kept
    const audit = (await db.query<Record<string, unknown>>("SELECT * FROM audit_logs WHERE record_id = $1", [data.id])).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0]!.blockchain_hash).toBe(audit_hash);
    expect(audit[0]!.prev_hash).toBe(GENESIS_HASH);
    expect(audit[0]!.tenant_id).toBe(data.id);
    expect((audit[0]!.record_snapshot as Record<string, unknown>).full_name).toBe("Amina Khan");
    const stamps = (await db.query("SELECT audit_hash, status FROM stamp_queue")).rows;
    expect(stamps).toEqual([{ audit_hash, status: "pending" }]);
  });

  it("updates only the provided columns and chains prev_hash to the record's last hash automatically", async () => {
    const created = await writeWithAudit({ client: db, table: "tenants", action: "CREATE", ...actor, record: { full_name: "Ben Osei", room_number: "2", nino: "QQ123456C" } });
    const updated = await writeWithAudit({ client: db, table: "tenants", action: "UPDATE", ...actor, record: { id: created.data.id, room_number: "5" } });
    expect(updated.data.room_number).toBe("5");
    expect(updated.data.nino).toBe("QQ123456C"); // untouched
    const rows = (await db.query<{ prev_hash: string; blockchain_hash: string; action: string }>(
      "SELECT prev_hash, blockchain_hash, action FROM audit_logs WHERE record_id = $1 ORDER BY created_at", [created.data.id])).rows;
    expect(rows.map((r) => r.action)).toEqual(["CREATE", "UPDATE"]);
    expect(rows[1]!.prev_hash).toBe(rows[0]!.blockchain_hash);
  });

  it("writes to a table without updated_at and links the audit row to the tenant", async () => {
    const t = await writeWithAudit({ client: db, table: "tenants", action: "CREATE", ...actor, record: { full_name: "Cara Lee" } });
    const c = await writeWithAudit({ client: db, table: "service_charges", action: "CREATE", ...actor, tenant_id: t.data.id as string,
      record: { tenant_id: t.data.id, week_label: "Week 1", due_date: "2026-09-01", amount: 150 } });
    await writeWithAudit({ client: db, table: "service_charges", action: "UPDATE", ...actor, tenant_id: t.data.id as string, record: { id: c.data.id, is_paid: true } });
    const paid = (await db.query<{ is_paid: boolean }>("SELECT is_paid FROM service_charges WHERE id = $1", [c.data.id])).rows[0];
    expect(paid?.is_paid).toBe(true);
    const audit = (await db.query<{ tenant_id: string }>("SELECT tenant_id FROM audit_logs WHERE record_id = $1", [c.data.id])).rows;
    expect(audit.every((a) => a.tenant_id === t.data.id)).toBe(true);
  });

  it("stores objects as JSON (jsonb) and hashes the canonical payload", async () => {
    const state = { input_mode: "ocr", extracted: { full_name: "Zed" } };
    const { data, audit_hash } = await writeWithAudit({ client: db, table: "drafts", action: "CREATE", ...actor, record: { machine_state: state, step: 2 } });
    expect((data.machine_state as typeof state).extracted.full_name).toBe("Zed");
    const row = (await db.query<{ created_at: Date; prev_hash: string; record_id: string }>("SELECT created_at, prev_hash, record_id FROM audit_logs WHERE record_id = $1", [data.id])).rows[0]!;
    const canonical = buildCanonicalString({ table_name: "drafts", record_id: row.record_id, action: "CREATE", payload: { machine_state: state, step: 2 },
      ...actor, prev_hash: row.prev_hash, created_at: new Date(row.created_at).toISOString() });
    const expected = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)))).map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(audit_hash).toBe(expected);
  });

  it("rolls everything back when the write fails — no orphan audit row, no orphan stamp", async () => {
    const before = (await db.query<{ n: string }>("SELECT count(*) n FROM audit_logs")).rows[0]!.n;
    const stampsBefore = (await db.query<{ n: string }>("SELECT count(*) n FROM stamp_queue")).rows[0]!.n;
    await expect(writeWithAudit({ client: db, table: "tenants", action: "CREATE", ...actor, record: { no_such_column: "x" } })).rejects.toThrow();
    expect((await db.query<{ n: string }>("SELECT count(*) n FROM audit_logs")).rows[0]!.n).toBe(before);
    expect((await db.query<{ n: string }>("SELECT count(*) n FROM stamp_queue")).rows[0]!.n).toBe(stampsBefore);
  });

  it("refuses unsafe identifiers", async () => {
    await expect(writeWithAudit({ client: db, table: 'tenants"; DROP TABLE tenants;--', action: "CREATE", ...actor, record: { full_name: "x" } })).rejects.toThrow(/unsafe identifier/);
  });

  it("the audit log is append-only at the database", async () => {
    await expect(db.query("UPDATE audit_logs SET user_name = 'x'")).rejects.toThrow(/append-only/);
    await expect(db.query("DELETE FROM audit_logs")).rejects.toThrow(/append-only/);
  });
});
