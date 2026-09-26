import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { triageByRules, triageIssue } from "./triage";

describe("triageByRules — the always-available safety net", () => {
  it("flags a gas smell as an emergency", () => {
    const t = triageByRules("There's a strong smell of gas in the kitchen");
    expect(t.severity).toBe("emergency");
    expect(t.category).toBe("gas");
    expect(t.reasoning).toMatch(/smell of gas/i);
  });
  it("flags a flood as an emergency, categorised as plumbing", () => {
    // The severity pattern matches the bare word "flood", not "flooding" — this is a real word-boundary
    // characteristic of the ported regex (\\bflood\\b), not something this test works around by accident.
    const t = triageByRules("There is a flood coming from under the sink, everywhere");
    expect(t).toMatchObject({ severity: "emergency", category: "plumbing" });
  });
  it("flags a broken boiler as urgent, categorised as heating", () => {
    // Three ordering rules to respect, or the wrong bucket wins: severity checks emergency before urgent,
    // and "no heating" (total loss) is itself an emergency phrase; the urgent pattern requires "boiler"
    // directly followed by "broken/not working/fault" with no words in between ("boiler is broken" does
    // NOT match); category checks plumbing before heating, so this avoids "water" too.
    const t = triageByRules("Boiler fault — please can someone look at it");
    expect(t).toMatchObject({ severity: "urgent", category: "heating" });
  });
  it("flags a scuffed wall as cosmetic", () => {
    const t = triageByRules("There's a scuff mark on the hallway wall");
    expect(t.severity).toBe("cosmetic");
  });
  it("defaults to routine and general when nothing matches", () => {
    const t = triageByRules("The doorbell makes a funny noise sometimes");
    expect(t).toMatchObject({ severity: "routine", category: "general" });
    expect(t.reasoning).toMatch(/nothing.*risk/i);
  });
  it("checks severity before category, and stops at the first severity match", () => {
    // Contains both an emergency cue (fire) and a cosmetic-sounding word (stain) — emergency must win.
    const t = triageByRules("There's a burning smell and a stain on the ceiling, I think there's a fire");
    expect(t.severity).toBe("emergency");
  });
  it("handles empty or missing text without throwing", () => {
    expect(triageByRules("")).toMatchObject({ severity: "routine", category: "general" });
    expect(triageByRules(undefined as unknown as string)).toMatchObject({ severity: "routine", category: "general" });
  });
});

describe("triageIssue — no provider configured", () => {
  const savedEnv = { ...process.env };
  beforeEach(() => {
    for (const k of ["AZURE_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "XAI_API_KEY", "RUNCRATE_API_KEY"]) delete process.env[k];
  });
  afterEach(() => { process.env = { ...savedEnv }; });

  it("falls back to rules immediately, reports mode 'live' (a real classifier ran, just not an LLM), and names the rules source", async () => {
    const r = await triageIssue("There is a flood coming from under the sink");
    expect(r.mode).toBe("live");
    expect(r.source).toBe("rules:triage");
    expect(r.data).toMatchObject({ severity: "emergency", category: "plumbing" });
  });

  it("never throws — the caller never needs a try/catch of its own", async () => {
    await expect(triageIssue("anything at all")).resolves.toBeDefined();
  });
});

describe("triageIssue — a provider is configured but unreachable", () => {
  const savedEnv = { ...process.env };
  beforeEach(() => { process.env["OPENAI_API_KEY"] = "sk-test-not-a-real-key"; });
  afterEach(() => { process.env = { ...savedEnv }; });

  it("falls back to rules on any provider failure, and says so in the source", async () => {
    const r = await triageIssue("The boiler isn't working, no hot water");
    expect(r.mode).toBe("live");
    expect(r.source).toBe("rules:triage(fallback)");
    expect(r.data.severity).toBe("urgent");
  }, 15_000);
});
