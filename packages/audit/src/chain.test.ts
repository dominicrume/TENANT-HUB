import { describe, it, expect } from "vitest";
import { computeHash, buildCanonicalString, GENESIS_HASH, buildAuditRecord } from "./chain";

const SAMPLE_ENTRY = {
  table_name: "tenants",
  record_id:  "550e8400-e29b-41d4-a716-446655440000",
  action:     "CREATE" as const,
  payload:    { full_name: "David Okafor", room_number: "Room 4" },
  user_id:    "usr_001",
  user_name:  "Ahsan Rehman",
  user_role:  "manager",
  prev_hash:  GENESIS_HASH,
};

describe("audit chain", () => {
  it("produces deterministic hash for same input", async () => {
    const ts = "2026-05-24T14:00:00.000Z";
    const r1 = await buildAuditRecord(SAMPLE_ENTRY, ts);
    const r2 = await buildAuditRecord(SAMPLE_ENTRY, ts);
    expect(r1.hash).toBe(r2.hash);
    expect(r1.hash).toHaveLength(64);
  });

  it("produces different hash when payload changes", async () => {
    const ts = "2026-05-24T14:00:00.000Z";
    const r1 = await buildAuditRecord(SAMPLE_ENTRY, ts);
    const r2 = await buildAuditRecord({ ...SAMPLE_ENTRY, payload: { full_name: "TAMPERED" } }, ts);
    expect(r1.hash).not.toBe(r2.hash);
  });

  it("canonical string contains all fields in order", () => {
    const partial = { ...SAMPLE_ENTRY, created_at: "2026-05-24T14:00:00.000Z" };
    const s = buildCanonicalString(partial);
    expect(s).toContain(GENESIS_HASH);
    expect(s).toContain("tenants");
    expect(s).toContain("CREATE");
  });
});
