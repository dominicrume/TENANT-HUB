import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { extractCommitmentsByRules, summariseByRules, summariseInteraction, parseDueDate } from "./memory";

describe("parseDueDate", () => {
  it("reads an explicit ISO date", () => {
    expect(parseDueDate("Will chase this by 2026-03-05")).toBe("2026-03-05");
  });
  it("reads a UK-format date", () => {
    expect(parseDueDate("Will chase this by 05/03/2026")).toBe("2026-03-05");
  });
  it("resolves 'tomorrow' against a fixed clock", () => {
    expect(parseDueDate("Will call back tomorrow", new Date("2026-03-05T09:00:00Z"))).toBe("2026-03-06");
  });
  it("resolves 'next week' against a fixed clock", () => {
    expect(parseDueDate("Will follow up next week", new Date("2026-03-05T09:00:00Z"))).toBe("2026-03-12");
  });
  it("resolves a bare weekday to its next occurrence, today included", () => {
    // 2026-03-05 is a Thursday.
    expect(parseDueDate("Will drop it off by Thursday", new Date("2026-03-05T09:00:00Z"))).toBe("2026-03-05");
    expect(parseDueDate("Will drop it off by Friday", new Date("2026-03-05T09:00:00Z"))).toBe("2026-03-06");
  });
  it("returns null when nothing dates the promise", () => {
    expect(parseDueDate("Will chase this up")).toBeNull();
  });
});

describe("extractCommitmentsByRules", () => {
  it("lifts a promise made by staff, defaulting owner to support_worker", () => {
    const c = extractCommitmentsByRules("Visited today, all fine. Will chase this up with the GP tomorrow.");
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ owner: "support_worker" });
    expect(c[0]!.text).toMatch(/will chase this up/i);
  });
  it("attributes a promise explicitly made by the tenant", () => {
    const c = extractCommitmentsByRules("Tenant agreed to bring proof of income by Friday.");
    expect(c[0]).toMatchObject({ owner: "tenant" });
  });
  it("attributes a promise made by a contractor", () => {
    const c = extractCommitmentsByRules("The plumber will return tomorrow to finish the job.");
    expect(c[0]).toMatchObject({ owner: "contractor" });
  });
  it("attributes a promise involving the council or housing benefit", () => {
    const c = extractCommitmentsByRules("Council will confirm the HB backdate by next week.");
    expect(c[0]).toMatchObject({ owner: "council" });
  });
  it("finds no commitment in a plain factual note", () => {
    expect(extractCommitmentsByRules("Visited today. Flat was tidy. No concerns raised.")).toHaveLength(0);
  });
  it("lifts more than one promise from the same note, each its own row", () => {
    const c = extractCommitmentsByRules("Will chase this by Friday. Tenant agreed to call the GP tomorrow.");
    expect(c).toHaveLength(2);
    expect(c.map((x) => x.owner)).toEqual(["support_worker", "tenant"]);
  });
  it("handles empty text without throwing", () => {
    expect(extractCommitmentsByRules("")).toEqual([]);
    expect(extractCommitmentsByRules(undefined as unknown as string)).toEqual([]);
  });
});

describe("summariseByRules", () => {
  it("takes the first sentence", () => {
    expect(summariseByRules("Visited today, all fine. Will call back tomorrow.")).toBe("Visited today, all fine.");
  });
  it("caps a long first sentence", () => {
    const long = `This is a very long sentence that goes on and on ${"and on ".repeat(20)}without stopping.`;
    const s = summariseByRules(long);
    expect(s.length).toBeLessThanOrEqual(140);
    expect(s.endsWith("...")).toBe(true);
  });
  it("returns empty string for empty input", () => {
    expect(summariseByRules("")).toBe("");
  });
});

describe("summariseInteraction — no provider configured", () => {
  const savedEnv = { ...process.env };
  beforeEach(() => {
    for (const k of ["AZURE_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "XAI_API_KEY", "RUNCRATE_API_KEY"]) delete process.env[k];
  });
  afterEach(() => { process.env = { ...savedEnv }; });

  it("falls back to the rule-based summary and still extracts commitments", async () => {
    const r = await summariseInteraction("Visited today, all fine. Will call HB tomorrow to chase the claim.");
    expect(r.mode).toBe("live");
    expect(r.source).toBe("rules:memory");
    expect(r.summary).toBe("Visited today, all fine.");
    expect(r.commitments).toHaveLength(1);
  });

  it("never throws — the caller never needs a try/catch of its own", async () => {
    await expect(summariseInteraction("anything at all")).resolves.toBeDefined();
  });
});

describe("summariseInteraction — a provider is configured but unreachable", () => {
  const savedEnv = { ...process.env };
  beforeEach(() => { process.env["OPENAI_API_KEY"] = "sk-test-not-a-real-key"; });
  afterEach(() => { process.env = { ...savedEnv }; });

  it("falls back to the rule-based summary on any provider failure, and says so in the source", async () => {
    const r = await summariseInteraction("Session went well. Tenant agreed to attend the GP appointment on Monday.");
    expect(r.source).toBe("rules:memory(fallback)");
    expect(r.commitments[0]).toMatchObject({ owner: "tenant" });
  }, 15_000);
});
