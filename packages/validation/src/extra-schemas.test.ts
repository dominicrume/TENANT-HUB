import { describe, it, expect } from "vitest";
import {
  SessionCreateSchema,
  ServiceChargeCreateSchema,
  IntakeChecklistPatchSchema,
  CHECKLIST_ITEMS,
} from "./index";

describe("SessionCreateSchema", () => {
  it("accepts a valid session", () => {
    const r = SessionCreateSchema.safeParse({
      tenant_id: "11111111-1111-1111-1111-111111111111",
      session_type: "weekly",
      session_date: "2026-05-24",
      notes: "Checked in, all well.",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty notes and bad type", () => {
    expect(SessionCreateSchema.safeParse({
      tenant_id: "11111111-1111-1111-1111-111111111111",
      session_type: "yearly",
      session_date: "2026-05-24",
      notes: "",
    }).success).toBe(false);
  });
});

describe("ServiceChargeCreateSchema", () => {
  it("requires a non-negative amount", () => {
    expect(ServiceChargeCreateSchema.safeParse({
      tenant_id: "11111111-1111-1111-1111-111111111111",
      week_label: "Week 1",
      due_date: "2026-05-24",
      amount: -5,
      is_paid: false,
    }).success).toBe(false);
  });
});

describe("IntakeChecklistPatchSchema", () => {
  it("requires id and accepts boolean items", () => {
    const r = IntakeChecklistPatchSchema.safeParse({
      id: "11111111-1111-1111-1111-111111111111",
      gp_registered: true,
    });
    expect(r.success).toBe(true);
  });

  it("covers 10 checklist items", () => {
    expect(CHECKLIST_ITEMS).toHaveLength(10);
  });
});
