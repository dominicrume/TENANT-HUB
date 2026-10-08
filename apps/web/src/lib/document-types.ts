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
