/**
 * Regulation scope selects the rule set — IN CODE (H13), same discipline as
 * arrears-ladder.ts's asset class. A live legislation feed carries mostly
 * items with nothing to do with housing at all; the classifier's job is to
 * be right when it commits to a scope and honest — "unknown" — the rest of
 * the time. "unknown" is never mapped to a property (BUILD_PLAN C27): this
 * is deliberately conservative pattern matching, not legal interpretation,
 * and it must never look more confident than it is (H14: no legal or
 * financial advice). A person reviews every "unknown" item; the classifier
 * only ever narrows what a person has to look at, never decides for them.
 */
import type { RegScope, AssetClass, UnitClass } from "@tenant-hub/validation";

export interface RegulationClassification { scope: RegScope; confidence: number | null }

/** Checked in this order — a safety duty ("all") outranks a tenure-type duty naming the same instrument. */
const SCOPE_PATTERNS: [RegScope, RegExp][] = [
  ["all", /\b(fire safety|housing health and safety|hhsrs|gas safety|electrical safety|smoke and carbon monoxide alarm)\b/i],
  ["supported", /\b(supported housing|exempt accommodation|supported exempt accommodation|care and support)\b/i],
  ["commercial", /\b(business tenanc(y|ies)|commercial landlord|non-domestic rates|business rates)\b/i],
  ["residential", /\b(assured shorthold tenanc(y|ies)|private rented sector|renters.? rights|section 21|tenancy deposit)\b/i],
];

/** Rules only — no model, no confidence beyond "a phrase matched" or "nothing did". */
export function classifyRegulationScope(title: string | null | undefined, excerpt: string | null | undefined): RegulationClassification {
  const text = `${title ?? ""} ${excerpt ?? ""}`;
  for (const [scope, re] of SCOPE_PATTERNS) if (re.test(text)) return { scope, confidence: 0.8 };
  return { scope: "unknown", confidence: null };
}

/** A property is affected when the scope is universal, matches its own asset class, or — for a mixed
 *  property — matches any unit class actually on site (the same rule arrears-ladder.ts and
 *  compliance-watch use: a mixed property is never treated as any one class). */
export function propertyMatchesScope(scope: RegScope, assetClass: AssetClass, unitClasses: readonly UnitClass[]): boolean {
  if (scope === "all") return true;
  if (scope === "unknown") return false;
  if (assetClass === "mixed") return unitClasses.includes(scope);
  return assetClass === scope;
}
