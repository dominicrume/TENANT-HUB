/**
 * Shared intake-pipeline types + the field list the canonical hash is computed
 * over. The draft's `machine_state` JSONB holds DraftState; `step` and
 * `canonical_hash` are dedicated columns (H5: server-side, never browser).
 */
import type { TenantCreate } from "@tenant-hub/validation";

export type InputMode = "manual" | "ocr" | "voice";

export interface DraftState {
  input_mode: InputMode;
  extracted: Partial<TenantCreate>;
  confirmed_by?: string;
  confirmed_at?: string;
  signature?: { name: string; date: string };
}

export interface Draft {
  id: string;
  step: number;
  canonical_hash: string | null;
  machine_state: DraftState;
  created_at?: string;
}

// The fields the canonical hash binds over (stable order via hashRecord sort).
export const HASHED_FIELDS = [
  "title", "full_name", "dob", "nino", "nationality", "date_entry_uk",
  "address", "postcode", "room_number", "moved_in", "mobile", "email", "languages",
  "benefit_type", "benefit_frequency", "benefit_amount",
  "nok_name", "nok_relationship", "nok_phone", "nok_address",
  "doctor", "probation_officer",
] as const;

export function canonicalSubset(data: Partial<TenantCreate>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of HASHED_FIELDS) {
    const v = (data as Record<string, unknown>)[k];
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}

export const INTAKE_STEPS = ["Input", "Extract", "Review", "Verify", "Complete"] as const;

export const FIELD_LABELS: Record<string, string> = {
  title: "Title", full_name: "Full Name", dob: "Date of Birth", nino: "NINO",
  nationality: "Nationality", date_entry_uk: "Date of Entry to UK",
  address: "Address", postcode: "Postcode", room_number: "Room Number",
  moved_in: "Moved-in Date", mobile: "Mobile", email: "Email", languages: "Languages",
  benefit_type: "Benefit Type", benefit_frequency: "Benefit Frequency", benefit_amount: "Amount (£)",
  nok_name: "Next of Kin", nok_relationship: "Relationship", nok_phone: "NOK Phone",
  nok_address: "NOK Address", doctor: "Doctor / GP", probation_officer: "Probation Officer",
};
