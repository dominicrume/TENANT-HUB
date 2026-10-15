/**
 * The lead's road to moving in — the dashboard timeline and the Leads board
 * share this one list. Order per Matloob (2026-10-14) with referencing where
 * the office actually does it (after the viewing, before sign-up):
 * received → viewing → referenced → signing up → moved in.
 */
export const LEAD_STAGES = [
  { key: "received",   label: "Lead received",  hint: "Someone has asked for a room" },
  { key: "viewing",    label: "Viewing",        hint: "Booked for a person, at a room" },
  { key: "referenced", label: "Referenced",     hint: "Reference asked for and back" },
  { key: "offer",      label: "Signing up",     hint: "Room offered, sign-up pack going" },
  { key: "moved_in",   label: "Moved in",       hint: "Now a tenant" },
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number]["key"] | "lost";

/** The three ways in (Matloob, 2026-10-14) — same list as station 1 on the journey. */
export const LEAD_SOURCES = [
  { key: "self_referred", label: "Self-referred" }, { key: "professionally_referred", label: "Professionally referred" }, { key: "via_advert", label: "Via advert" },
] as const;

export interface Lead {
  id: string; full_name: string; phone: string | null; email: string | null; source: string; stage: LeadStage; notes: string | null;
  property_id: string | null; unit_id: string | null; landlord_id: string | null; viewing_at: string | null; tenant_id: string | null; lost_reason: string | null;
  assigned_to: string | null; viewing_done_at: string | null;
  referee_name: string | null; referee_contact: string | null; reference_requested_at: string | null; reference_received_at: string | null; reference_notes: string | null;
  created_by: string; created_at: string; updated_at: string; property_name?: string | null; unit_reference?: string | null;
}
