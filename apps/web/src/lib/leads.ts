/** The tenant journey — the dashboard timeline and the Leads board share this one list (Matloob, 2026-10-14). */
export const LEAD_STAGES = [
  { key: "received",   label: "Lead received",  hint: "Someone has asked for a room" },
  { key: "referenced", label: "Referenced",     hint: "ID / references in hand" },
  { key: "viewing",    label: "Viewing",        hint: "Booked or done" },
  { key: "offer",      label: "Offer",          hint: "Room offered, paperwork going" },
  { key: "moved_in",   label: "Moved in",       hint: "Now a tenant" },
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number]["key"] | "lost";

export const LEAD_SOURCES = [
  { key: "council", label: "Council referral" }, { key: "self", label: "Self referral" }, { key: "agency", label: "Agency" }, { key: "charity", label: "Charity / support service" }, { key: "other", label: "Other" },
] as const;

export interface Lead {
  id: string; full_name: string; phone: string | null; email: string | null; source: string; stage: LeadStage; notes: string | null;
  property_id: string | null; unit_id: string | null; landlord_id: string | null; viewing_at: string | null; tenant_id: string | null; lost_reason: string | null;
  created_by: string; created_at: string; updated_at: string; property_name?: string | null; unit_reference?: string | null;
}
