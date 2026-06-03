import { describe, it, expect } from "vitest";
import { CanonicalTenantSchema, NinoSchema, UkPostcodeSchema } from "./index";

describe("NinoSchema", () => {
  it("accepts valid NINO", () => {
    expect(NinoSchema.parse("AB 12 34 56 C")).toBe("AB123456C");
  });
  it("rejects invalid NINO", () => {
    expect(() => NinoSchema.parse("INVALID")).toThrow();
  });
});

describe("UkPostcodeSchema", () => {
  it("normalises postcode", () => {
    expect(UkPostcodeSchema.parse("b12 0hd")).toBe("B12 0HD");
  });
});

describe("CanonicalTenantSchema", () => {
  it("rejects room number without 'Room' prefix", () => {
    expect(() =>
      CanonicalTenantSchema.parse({ room_number: "4" })
    ).toThrow();
  });
});
