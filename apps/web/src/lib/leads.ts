/**
 * The lead's road to moving in — the dashboard timeline and the Leads board
 * share this one list. Order per Matloob (2026-10-14) with referencing where
 * the office actually does it (after the viewing, before sign-up):
 * received → viewing → referenced → signing up → moved in.
 */
export const LEAD_STAGES = [
  { key: "received",   label: "Lead received",  hint: "Someone has asked for a room" },
  { key: "viewing",    label: "Viewing",        hint: "Booked for a person, at a room" },
  { key: "referenced", label: "Referenced",     hint: "ID seen, references back" },
  { key: "offer",      label: "Signing up",     hint: "Room offered, sign-up pack going" },
  { key: "moved_in",   label: "Moved in",       hint: "Now a tenant" },
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number]["key"] | "lost";

/** The three ways in (Matloob, 2026-10-14) — same list as station 1 on the journey. */
export const LEAD_SOURCES = [
  { key: "self_referred", label: "Self-referred" }, { key: "professionally_referred", label: "Professionally referred" }, { key: "via_advert", label: "Via advert" },
] as const;

/** Who a reference can come from (migration 065). */
export const REFERENCE_KINDS = [
  { key: "previous_landlord", label: "Previous landlord" },
  { key: "support_worker", label: "Support worker / key worker" },
  { key: "council", label: "Council / housing officer" },
  { key: "employer", label: "Employer" },
  { key: "character", label: "Character reference" },
  { key: "other", label: "Other" },
] as const;
export const REFERENCE_METHODS = [
  { key: "phone", label: "By phone" }, { key: "email", label: "By email" }, { key: "letter", label: "By letter" }, { key: "in_person", label: "In person" },
] as const;
export const REFERENCE_OUTCOMES = [
  { key: "pending", label: "Waiting", colour: "#E8A84C" },
  { key: "satisfactory", label: "Satisfactory ✓", colour: "#1E7F4F" },
  { key: "unsatisfactory", label: "Not satisfactory", colour: "#B24A31" },
  { key: "no_reply", label: "No reply", colour: "#55637A" },
] as const;

export interface LeadReference {
  id: string; kind: string; referee_name: string; contact: string | null; method: string | null;
  requested_at: string; received_at: string | null; outcome: string; notes: string | null; created_by: string | null;
}

export interface Lead {
  id: string; full_name: string; phone: string | null; email: string | null; source: string; stage: LeadStage; notes: string | null;
  property_id: string | null; unit_id: string | null; landlord_id: string | null; viewing_at: string | null; tenant_id: string | null; lost_reason: string | null;
  assigned_to: string | null; viewing_done_at: string | null;
  id_checked_at: string | null; benefit_checked_at: string | null; no_reference_needed: boolean;
  references?: LeadReference[];
  created_by: string; created_at: string; updated_at: string; property_name?: string | null; unit_reference?: string | null;
  /** An intake started from this lead and not yet committed — "Continue sign-up" instead of starting again. */
  draft_id?: string | null;
  tenant_room?: string | null;
}

/** Referencing is done when ID has been seen and at least one reference is satisfactory (or none is needed). */
export function referencingReady(l: Lead): boolean {
  return !!l.id_checked_at && (l.no_reference_needed || (l.references ?? []).some((r) => r.outcome === "satisfactory"));
}
