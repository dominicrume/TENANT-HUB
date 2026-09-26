import { describe, it, expect } from "vitest";
import { withAccommodation, stripSpineOwnedFields } from "./accommodation";

const tenant = { address: "Old Street 1", postcode: "B1 1AA", room_number: "Room 9", moved_in: "2025-01-01" };
const acc = {
  property: { id: "p", name: "14 Ravenhurst St", address_line1: "14 Ravenhurst St", postcode: "B12 8AA", asset_class: "supported" as const },
  unit: { id: "u", reference: "Room 4", unit_class: "supported" as const },
  tenancy: { id: "t", start_date: "2026-03-01", rent_amount: 150, rent_frequency: "weekly" as const, status: "active" as const },
};

describe("accommodation projection (H3)", () => {
  it("derives address, postcode, room and move-in from the active tenancy", () => {
    const t = withAccommodation(tenant, acc);
    expect(t.address).toBe("14 Ravenhurst St");
    expect(t.postcode).toBe("B12 8AA");
    expect(t.room_number).toBe("Room 4");
    expect(t.moved_in).toBe("2026-03-01");
    expect(Object.isFrozen(t)).toBe(true);
  });
  it("leaves the stored columns alone when there is no active tenancy", () => {
    expect(withAccommodation(tenant, null).room_number).toBe("Room 9");
    expect(withAccommodation(tenant, { ...acc, tenancy: { ...acc.tenancy, status: "ended" } }).room_number).toBe("Room 9");
  });
  it("strips spine-owned fields from a patch only when a tenancy owns them", () => {
    expect(stripSpineOwnedFields({ full_name: "A", room_number: "Room 1", address: "x" }, true)).toEqual({ patch: { full_name: "A" }, stripped: ["address", "room_number"] });
    expect(stripSpineOwnedFields({ room_number: "Room 1" }, false).stripped).toEqual([]);
  });
});
