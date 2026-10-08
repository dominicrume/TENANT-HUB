/**
 * Document type dropdowns (BUILD_PLAN C50) — "pick from a dropdown instead of
 * typing it out", with an "Other" option for anything not listed. Two
 * separate lists because property documents and tenant documents are, per
 * the client's own words, "two separate things, not one shared pile".
 */
export const PROPERTY_DOCUMENT_TYPES = [
  "Lease with landlord",
  "Invoice",
  "EPC",
  "Gas Safety Certificate",
  "Electrical (EICR)",
  "Fire Risk Assessment",
  "HMO Licence",
] as const;

export const TENANT_DOCUMENT_TYPES = [
  "Tenancy agreement",
  "Authorisation letter",
  "Initial Risk Assessment",
  "Housing Benefit form",
  "ID",
  "Photo",
  "Proof of Income (Universal Credit / Pension)",
] as const;

export const OTHER_DOCUMENT_TYPE = "Other";

/* ── The "Other" loophole, closed ──────────────────────────────────────────
 * "Other" stays (the client asked for it: C50, "with an Other option") but it
 * is no longer a way round the two lists. Typing "HB FORM" into a PROPERTY's
 * Other field used to go straight in — that's how a tenant document ended
 * up filed under a property on 2026-10-08. Now each side refuses a name that
 * clearly belongs to the other side, with a message saying where it goes.
 * Deliberately conservative: only clear cross-category names are blocked;
 * anything genuinely novel still goes through. Enforced in the API routes,
 * not just the form — the server is the boundary, the dropdown is a hint.
 */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const TENANT_ALIASES = [
  "hb", "hbform", "housingbenefit", "housingbenefitform", "identification", "passport", "brp", "drivinglicence",
  "tenancyagreement", "licenceagreement", "licenseagreement", "authorisationletter", "authorizationletter",
  "initialriskassessment", "proofofincome", "universalcredit", "pension", "deposit", "proofofaddress",
];
const PROPERTY_ALIASES = [
  "epc", "gassafety", "gassafetycertificate", "cp12", "eicr", "electricalcertificate", "fireriskassessment", "fra",
  "hmolicence", "hmolicense", "lease", "leasewithlandlord", "invoice", "legionella", "legionellariskassessment",
  "asbestos", "asbestosregister", "pattesting", "emergencylighting", "smokealarm", "smokeandcoalarms", "firealarm",
];

function matches(name: string, list: readonly string[], aliases: readonly string[]): boolean {
  const n = norm(name);
  if (!n) return false;
  if (list.some((t) => norm(t) === n)) return true;
  // Short aliases ("hb", "epc", "fra") must match exactly; longer ones may
  // appear inside a longer label ("HB form 2026", "gas safety cert April").
  return aliases.some((a) => a === n || (a.length >= 5 && n.includes(a)));
}

/** True when a document name is clearly one of a TENANT's (ID, HB form, tenancy agreement…). */
export function looksLikeTenantDocument(name: string): boolean {
  return matches(name, TENANT_DOCUMENT_TYPES, TENANT_ALIASES);
}

/** True when a document name is clearly one of a PROPERTY's (EPC, gas safety, HMO licence…). */
export function looksLikePropertyDocument(name: string): boolean {
  return matches(name, PROPERTY_DOCUMENT_TYPES, PROPERTY_ALIASES);
}
