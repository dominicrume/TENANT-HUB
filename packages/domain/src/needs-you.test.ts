import { describe, it, expect } from "vitest";
import { buildNeedsYou, GROUP_ORDER, type NeedsYouInput } from "./needs-you";

const now = new Date("2026-09-26T15:00:00Z"); // afternoon → handover nudge is live
const day = (n: number) => new Date(now.getTime() - n * 864e5).toISOString().slice(0, 10);
const base = (): NeedsYouInput => ({
  tenants: [
    { id: "a", full_name: "Amina Khan", room_number: "4", is_active: true, is_archived: false, housing_benefit_status: "suspended", hb_claim_date: null, moved_in: day(200) },
    { id: "b", full_name: "Ben Osei", room_number: "2", is_active: true, is_archived: false, housing_benefit_status: "in_progress", hb_claim_date: day(30), moved_in: day(40) },
    { id: "c", full_name: "Cara Lee", room_number: "7", is_active: true, is_archived: false, housing_benefit_status: "in_progress", hb_claim_date: day(5), moved_in: day(6) },
    { id: "d", full_name: "Dan Old", room_number: "1", is_active: false, is_archived: true, housing_benefit_status: "suspended", hb_claim_date: null, moved_in: day(900) },
  ],
  charges: [
    { tenant_id: "a", amount: 150, is_paid: false, due_date: day(14) },
    { tenant_id: "a", amount: 150, is_paid: false, due_date: day(7) },
    { tenant_id: "b", amount: 150, is_paid: false, due_date: day(3) },
    { tenant_id: "b", amount: 150, is_paid: false, due_date: day(-4) }, // not yet due
  ],
  tickets: [
    { id: "t1", room_number: "4", issue_type: "Plumbing", status: "Open", assigned_to: null, reported_by: "Amina", created_at: new Date(now.getTime() - 3 * 864e5).toISOString() },
    { id: "t2", room_number: "2", issue_type: "Electrical", status: "In Progress", assigned_to: "staff-1", reported_by: null, created_at: now.toISOString() },
  ],
  drafts: [
    { id: "d1", step: 4, expires_at: new Date(now.getTime() + 864e5).toISOString(), machine_state: { extracted: { full_name: "New Person" } } },
    { id: "d2", step: 2, expires_at: null, machine_state: null },
    { id: "d3", step: 4, expires_at: new Date(now.getTime() - 864e5).toISOString(), machine_state: null }, // expired
  ],
  handoversToday: [],
  now,
});

describe("buildNeedsYou", () => {
  it("lists only what needs a person, grouped in cost order, emergencies first", () => {
    const r = buildNeedsYou(base());
    const kinds = r.items.map((i) => i.kind);
    expect(kinds).toEqual(["repairs", "housing_benefit", "housing_benefit", "money", "signoffs", "handover"]);
    const idx = kinds.map((k) => GROUP_ORDER.indexOf(k));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it("ignores archived tenants, recent HB claims, assigned repairs, early drafts and expired drafts", () => {
    const r = buildNeedsYou(base());
    const titles = r.items.map((i) => i.title).join(" | ");
    expect(titles).not.toContain("Dan Old");
    expect(titles).not.toContain("Cara Lee");
    expect(titles).not.toContain("Electrical");
    expect(r.items.filter((i) => i.kind === "signoffs")).toHaveLength(1);
    expect(r.items.find((i) => i.kind === "signoffs")?.title).toBe("Signature needed: New Person");
  });

  it("only counts arrears at two or more overdue weeks and never counts future charges", () => {
    const r = buildNeedsYou(base());
    const money = r.items.filter((i) => i.kind === "money");
    expect(money).toHaveLength(1);
    expect(money[0]!.title).toBe("2 weeks behind: Amina Khan, Room 4");
    expect(r.stats.moneyOwed).toBe(450); // a:300 + b:150 overdue; b's future charge excluded
  });

  it("every item has one plain-words button and a destination", () => {
    for (const i of buildNeedsYou(base()).items) {
      expect(i.cta.length).toBeGreaterThan(2);
      expect(i.href.startsWith("/")).toBe(true);
      expect(i.title).not.toMatch(/_/); // no enum leaks like in_progress
    }
  });

  it("is quiet when there is nothing to decide, and skips the handover nudge in the morning", () => {
    const r = buildNeedsYou({ tenants: [], charges: [], tickets: [], drafts: [], handoversToday: [], now: new Date("2026-09-26T09:00:00Z") });
    expect(r.items).toEqual([]);
    expect(r.stats).toEqual({ peopleHoused: 0, moneyOwed: 0, housingBenefitAtRisk: 0, repairsOpen: 0 });
  });
});
