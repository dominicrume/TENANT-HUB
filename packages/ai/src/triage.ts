/**
 * Issue triage: a tenant's own words → category + severity. Uses the
 * configured provider (see provider.ts / router.ts) when one is set; falls
 * back to transparent, deterministic rules otherwise, and on any provider
 * failure. Both paths report mode:"live" — a real classifier ran either
 * way, just not always an LLM. "simulated" is reserved for adapters standing
 * in for an external system with no data of their own (@tenant-hub/ports).
 *
 * provider.ts's complete() lazy-loads the Vercel AI SDK internally, so
 * importing activeProvider/complete here never eagerly triggers that SDK's
 * dependency graph — only an actual LLM call does. See provider.ts's header
 * for why that matters (a real transitive zod version conflict that plain
 * Node ESM resolution rejects, which is what the worker runs under via tsx).
 */
import { complete, activeProvider } from "./provider";

export type Severity = "emergency" | "urgent" | "routine" | "cosmetic";
export interface Triage { category: string; severity: Severity; reasoning: string }
export interface TriageResult { data: Triage; mode: "live"; source: string }

const SEVERITY_PATTERNS: [Severity, RegExp][] = [
  ["emergency", /\b(flood|leak(ing)?|water (coming|pouring|running)|burst|gas|smell(s|ing)? (of )?gas|sparks?|electric shock|fire|smoke|no heating|no power|break[- ]?in|locked out|ceiling (collapsed|coming down|falling)|sewage|carbon monoxide)\b/i],
  ["urgent", /\b(no hot water|boiler (broken|not working|fault)|toilet (blocked|not flushing)|blocked (drain|toilet)|broken lock|window (smashed|broken)|mould|mold|damp|rats?|mice|pests?|cockroach|fridge|cooker|oven not)\b/i],
  ["cosmetic", /\b(paint|scuff|mark on|chipped|stain|cosmetic|scratch)\b/i],
];
const CATEGORY_PATTERNS: [string, RegExp][] = [
  ["plumbing", /\b(water|leak|tap|toilet|sink|pipe|drain|flood|shower|bath)\b/i],
  ["heating", /\b(boiler|heating|radiator|hot water|thermostat)\b/i],
  ["electrical", /\b(electric|socket|light|power|fuse|spark|wiring)\b/i],
  ["gas", /\bgas\b/i],
  ["glazing", /\b(window|glass|pane)\b/i],
  ["locks", /\b(lock|door|key)\b/i],
  ["roofing", /\b(roof|gutter|tile|chimney)\b/i],
  ["pest control", /\b(rat|mice|mouse|pest|cockroach|wasp|ant)s?\b/i],
  ["damp", /\b(mould|mold|damp|condensation)\b/i],
  ["appliances", /\b(fridge|cooker|oven|washing machine|dishwasher)\b/i],
];

/** Deterministic, transparent, always available — no provider needed. The safety net every other path falls back to. */
export function triageByRules(text: string): Triage {
  const t = text || "";
  let severity: Severity = "routine";
  let hit = "";
  for (const [s, re] of SEVERITY_PATTERNS) { const m = t.match(re); if (m) { severity = s; hit = m[0]; break; } }
  const category = CATEGORY_PATTERNS.find(([, re]) => re.test(t))?.[0] ?? "general";
  const reasoning =
    severity === "emergency" ? `"${hit}" signals risk to people or the building, treated as an emergency` :
    severity === "urgent" ? `"${hit}" affects daily living, needs a trade soon, not immediately` :
    severity === "cosmetic" ? `"${hit}" is appearance only, can wait for a convenient visit` :
    "nothing in the report suggests risk, routine visit";
  return { category, severity, reasoning };
}

const VALID_SEVERITIES: readonly Severity[] = ["emergency", "urgent", "routine", "cosmetic"];

/** The tenant's own words → category + severity. AI when configured and reachable; rules otherwise, and on any failure. */
export async function triageIssue(text: string): Promise<TriageResult> {
  const provider = activeProvider();
  if (provider === "none") return { data: triageByRules(text), mode: "live", source: "rules:triage" };
  try {
    const raw = await complete({
      system: "You triage maintenance reports for a UK housing provider. Categories: plumbing, heating, electrical, gas, glazing, locks, roofing, pest control, damp, appliances, general. Severity: emergency (risk to people or the building right now), urgent (affects daily living), routine, cosmetic. Reply with a single JSON object {\"category\":string,\"severity\":string,\"reasoning\":string} and nothing else.",
      prompt: `Report: """${text}"""`,
    });
    const cleaned = raw.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
    const json = JSON.parse(cleaned) as Partial<Triage>;
    const severity = VALID_SEVERITIES.includes(json.severity as Severity) ? (json.severity as Severity) : triageByRules(text).severity;
    return { data: { category: String(json.category || "general").toLowerCase(), severity, reasoning: String(json.reasoning || "") }, mode: "live", source: provider };
  } catch {
    return { data: triageByRules(text), mode: "live", source: "rules:triage(fallback)" };
  }
}
