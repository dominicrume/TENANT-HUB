import { describe, it, expect } from "vitest";
import { classifyRegulationScope, propertyMatchesScope } from "./regulation";

describe("classifyRegulationScope", () => {
  it("classifies a safety instrument as 'all', ahead of any tenure-type phrase in the same title", () => {
    const r = classifyRegulationScope("The Fire Safety (England) Regulations 2026", "Applies to all supported housing exempt accommodation and assured shorthold tenancies alike.");
    expect(r.scope).toBe("all");
  });
  it("classifies a supported-housing instrument", () => {
    expect(classifyRegulationScope("Supported Housing (Regulatory Oversight) Act", "").scope).toBe("supported");
  });
  it("classifies a commercial-tenancy instrument", () => {
    expect(classifyRegulationScope("The Business Tenancies (Amendment) Order", "").scope).toBe("commercial");
  });
  it("classifies a residential-tenancy instrument", () => {
    expect(classifyRegulationScope("The Renters' Rights Act", "Abolishes assured shorthold tenancies and reforms section 21.").scope).toBe("residential");
  });
  it("classifies anything with no housing-specific phrase as unknown, with no confidence claimed", () => {
    const r = classifyRegulationScope("The Road Traffic (Amendment) Regulations 2026", "Speed limits on trunk roads.");
    expect(r).toEqual({ scope: "unknown", confidence: null });
  });
  it("handles missing title and excerpt without throwing", () => {
    expect(classifyRegulationScope(null, undefined)).toEqual({ scope: "unknown", confidence: null });
  });
});

describe("propertyMatchesScope", () => {
  it("an 'all' scope always matches, regardless of asset class", () => {
    expect(propertyMatchesScope("all", "commercial", [])).toBe(true);
  });
  it("an 'unknown' scope never matches — it is never mapped", () => {
    expect(propertyMatchesScope("unknown", "supported", ["supported"])).toBe(false);
  });
  it("a single-class property matches only its own class", () => {
    expect(propertyMatchesScope("supported", "supported", [])).toBe(true);
    expect(propertyMatchesScope("residential", "supported", [])).toBe(false);
  });
  it("a mixed property matches by the unit classes actually on site, not by any property-level label", () => {
    expect(propertyMatchesScope("commercial", "mixed", ["supported", "commercial"])).toBe(true);
    expect(propertyMatchesScope("residential", "mixed", ["supported", "commercial"])).toBe(false);
  });
});
