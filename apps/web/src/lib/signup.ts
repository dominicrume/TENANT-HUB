/**
 * The sign-up pack — station 3 — as Reliance / Ash Shahada / Dawson keep it
 * on their drive: seven SECTION folders (Osama's Synology, photographed
 * 2026-10-14). Sections 3–6 are empty today and stay in the pack because
 * "it's the way we're asked to do it". `form` points at the in-app form
 * that produces that document (print / save as PDF); `pdf` marks the ones
 * that must also exist as a PDF. Templates with the landlord's letterhead
 * are coming from Osama; until then every slot can be filled by upload.
 */
export interface SignupSlot { name: string; pdf?: boolean; form?: string; aliases?: string[] }
export interface SignupSection { n: 1 | 2 | 3 | 4 | 5 | 6 | 7; title: string; slots: SignupSlot[] }

export const SIGNUP_SECTIONS: SignupSection[] = [
  { n: 1, title: "Sign-up forms", slots: [
    { name: "File contents" },
    { name: "Support checklist" },
    { name: "Personal details form", form: "personal" },
    { name: "Missing persons form", form: "missing" },
    { name: "Excluded licence agreement", pdf: true, aliases: ["licence agreement", "tenancy agreement"] },
    { name: "New extended licence agreement", pdf: true, aliases: ["extended licence"] },
    { name: "Authorisation form", pdf: true, aliases: ["authorisation letter", "authorization"] },
    { name: "Fire evacuation form" },
    { name: "Confidentiality form", form: "personal", aliases: ["confidentiality"] },
    { name: "Weekly service charge agreement", form: "ledger", aliases: ["service charge agreement"] },
    { name: "Licence key facts", pdf: true, aliases: ["key fact"] },
    { name: "NIL income form", aliases: ["nil income"] },
  ] },
  { n: 2, title: "Assessment", slots: [
    { name: "Referral initial assessment", form: "initial", aliases: ["initial assessment", "initial risk assessment"] },
    { name: "Risk assessment", form: "risk" },
  ] },
  { n: 3, title: "Section 3", slots: [] },
  { n: 4, title: "Section 4", slots: [] },
  { n: 5, title: "Section 5", slots: [] },
  { n: 6, title: "Section 6", slots: [] },
  { n: 7, title: "Housing benefit claim", slots: [
    { name: "ID", aliases: ["passport", "brp", "driving licence"] },
    { name: "Proof of benefit", aliases: ["proof of income", "universal credit", "pension"] },
    { name: "Photo" },
    { name: "Housing Benefit form", aliases: ["hb form"] },
  ] },
];

/** Does a filed document name satisfy a slot? Prefix on the slot name, or any alias anywhere in the name. */
export function slotMatches(slot: SignupSlot, docName: string): boolean {
  const n = docName.toLowerCase();
  if (n.startsWith(slot.name.toLowerCase())) return true;
  return (slot.aliases ?? []).some((a) => n.includes(a.toLowerCase()));
}

export const REFERRAL_SOURCES = [
  { key: "self_referred", label: "Self-referred", hint: "They came to us themselves" },
  { key: "professionally_referred", label: "Professionally referred", hint: "Council, charity, support service, agency" },
  { key: "via_advert", label: "Via advert", hint: "Saw our advertising" },
] as const;
export type ReferralSource = (typeof REFERRAL_SOURCES)[number]["key"];
