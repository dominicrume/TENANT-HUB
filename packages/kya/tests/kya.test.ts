import { describe, it, expect } from "vitest";
import { mandate, assertMayRead, assertMayDo, newReceipt, read, refuse, withOutcome, isExpired, MandateViolation } from "../src";

const m = mandate("arrears-ladder", ["tenancy_arrears", "ladder_config"], ["send_legal_notice", "move_money"]);

describe("mandates", () => {
  it("allow listed reads and refuse everything else", () => {
    expect(() => assertMayRead(m, "tenancy_arrears")).not.toThrow();
    expect(() => assertMayRead(m, "bank_account")).toThrow(MandateViolation);
  });
  it("refuse every read once expired", () => {
    const old = mandate("x", ["a"], [], "2020-01-01T00:00:00Z");
    expect(isExpired(old)).toBe(true);
    expect(() => assertMayRead(old, "a")).toThrow(/expired/);
  });
  it("block the never-do verbs before any write", () => {
    expect(() => assertMayDo(m, "send_legal_notice")).toThrow(MandateViolation);
    expect(() => assertMayDo(m, "draft_letter")).not.toThrow();
  });
});

describe("receipts", () => {
  it("record what was read, with provenance", () => {
    const r = read(newReceipt("arrears-ladder", "advance"), m, "tenancy_arrears", "live", "v1", new Date("2026-09-26T10:00:00Z"));
    expect(r.sourcesRead).toEqual([{ key: "tenancy_arrears", version: "v1", retrievedAt: "2026-09-26T10:00:00.000Z", mode: "live" }]);
  });
  it("record the ✋ refusal as the outcome, without throwing", () => {
    const r = refuse(newReceipt("arrears-ladder", "advance"), m, "send_legal_notice", "waits for the manager to press send");
    expect(r.refusals[0]).toEqual({ attempted: "send_legal_notice", reason: "Not in mandate — waits for the manager to press send" });
    expect(r.outcome).toBe("proposed");
  });
  it("refuse() on an allowed verb is a programming error", () => {
    expect(() => refuse(newReceipt("a", "b"), m, "draft_letter", "x")).toThrow(/not on the never-do list/);
  });
  it("withOutcome copies the receipt for a recorded write", () => {
    const r = read(newReceipt("a", "b"), m, "ladder_config", "live");
    const rec = withOutcome(r, "recorded");
    expect(rec.outcome).toBe("recorded");
    expect(r.outcome).toBe("proposed");
    expect(rec.sourcesRead).toEqual(r.sourcesRead);
  });
});
