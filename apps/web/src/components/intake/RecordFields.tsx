/**
 * RecordFields — renders the intake record from FIELD_LABELS, either editable
 * or read-only (used by extract, review and verify). Low-confidence OCR fields
 * get an amber border + ⚠️.
 */
"use client";

import { FIELD_LABELS } from "../../lib/intake";

import { COUNTRIES } from "../../lib/countries";

const PLACEHOLDERS: Record<string, string> = {
  full_name: "e.g., Orume Dominic Uririe",
  nino: "e.g., AB 12 34 56 C",
  address: "e.g., 123 High Street, London",
  postcode: "e.g., E1 6AN",
  room_number: "e.g., Room 1",
  mobile: "e.g., 07700 900077",
  email: "e.g., user@example.com",
  languages: "e.g., English, Arabic",
  benefit_amount: "e.g., 500.00",
  nok_name: "e.g., Jane Doe",
  nok_relationship: "e.g., Brother",
  nok_phone: "e.g., 07700 900088",
  nok_address: "e.g., 456 Main St, London",
  doctor: "e.g., Dr. Smith (City Clinic)",
  probation_officer: "e.g., Officer Jones",
};

/**
 * Saved properties/rooms for the active landlord that staff can PICK from the
 * dropdown instead of typing (Rume 2026-10-27 walkthrough: "the address I've
 * previously saved for that property should come up as a drop down, same for
 * every room"). All optional — when absent the fields behave exactly as before.
 *
 * Rendered as a native HTML <datalist>: user still sees a text input and can
 * type freely, but as they type, matching saved addresses/rooms appear as
 * suggestions. Picking one fires onPicked so the parent can auto-fill the
 * postcode and tag the draft with the chosen unit (so commit creates the
 * tenancy against the right room without a second data entry).
 */
export interface RecordFieldSuggestions {
  properties?: Array<{ id: string; address: string; postcode: string | null; label: string }>;
  /** AVAILABLE units only. The parent filters out occupied rooms so staff can't
   *  pick one and only discover at commit time it was taken (Rume 2026-10-28:
   *  "that should not be a problem… same as putting an email that's already
   *  registered — rejected the moment you type it, not at the end"). */
  units?: Array<{ id: string; reference: string; label: string }>;
  /** True when the matched property has rooms but every one is occupied.
   *  Lets the field surface a clear "no rooms available" state instead of a
   *  silently-empty dropdown that could still accept any typed value. */
  propertyFullyOccupied?: boolean;
  /** Total room count on the matched property, for the hint "3 of 7 available". */
  unitsTotal?: number;
  onPropertyPicked?: (propertyId: string) => void;
  onUnitPicked?: (unitId: string) => void;
}

export function RecordFields(props: {
  data: Record<string, unknown>;
  onChange?: (key: string, value: string) => void;
  readOnly?: boolean;
  large?: boolean;
  confidence?: Record<string, string>;
  errors?: Record<string, string>;
  suggestions?: RecordFieldSuggestions;
}) {
  const fontSize = props.large ? "18px" : "14px";

  return (
    <div style={{ display: "grid", gridTemplateColumns: props.large ? "1fr" : "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
      {Object.entries(FIELD_LABELS).map(([key, label]) => {
        const value = (props.data[key] as string | number | undefined) ?? "";
        const low = props.confidence?.[key] === "low";
        const inputStyle: React.CSSProperties = {
          width: "100%", minHeight: "44px", padding: "9px 11px", borderRadius: "8px",
          border: low ? "1px solid #E8A84C" : "1px solid #EDE8E1",
          fontFamily: "'Sora',sans-serif", fontSize: "14px", boxSizing: "border-box",
          backgroundColor: "#fff", color: "var(--navy)"
        };

        let inputElement = null;

        if (props.readOnly) {
          inputElement = (
            <div style={{ fontSize, color: String(value) ? "var(--navy)" : "#9AA6BC", padding: "8px 0", fontWeight: props.large ? 600 : 400 }}>
              {String(value) || "—"}
            </div>
          );
        } else if (key === "title") {
          inputElement = (
            <select value={String(value)} onChange={(e) => props.onChange?.(key, e.target.value)} style={inputStyle}>
              <option value="" disabled>Select Title</option>
              {["Mr", "Mrs", "Ms", "Miss", "Dr"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          );
        } else if (key === "nationality") {
          inputElement = (
            <select value={String(value)} onChange={(e) => props.onChange?.(key, e.target.value)} style={inputStyle}>
              <option value="" disabled>Select Nationality</option>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          );
        } else if (key === "benefit_type") {
          inputElement = (
            <select value={String(value)} onChange={(e) => props.onChange?.(key, e.target.value)} style={inputStyle}>
              <option value="" disabled>Select Benefit Type</option>
              {["Universal Credit", "Housing Benefit", "PIP", "ESA", "JSA", "Other"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          );
        } else if (key === "benefit_frequency") {
          inputElement = (
            <select value={String(value)} onChange={(e) => props.onChange?.(key, e.target.value)} style={inputStyle}>
              <option value="" disabled>Select Frequency</option>
              {["Monthly", "Fortnightly", "Weekly"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          );
        } else if (["dob", "moved_in", "date_entry_uk"].includes(key)) {
          inputElement = (
            <input
              type="date"
              value={String(value)}
              onChange={(e) => props.onChange?.(key, e.target.value)}
              style={inputStyle}
            />
          );
        } else if (key === "address" && (props.suggestions?.properties?.length ?? 0) > 0) {
          // Datalist of saved property addresses — typing filters, picking fires onPropertyPicked
          // so the parent can auto-fill the postcode and remember which property this is.
          inputElement = (
            <>
              <input
                type="text"
                list="th-property-suggestions"
                placeholder={PLACEHOLDERS[key] ?? ""}
                value={String(value)}
                onChange={(e) => {
                  const v = e.target.value;
                  props.onChange?.(key, v);
                  const match = props.suggestions?.properties?.find((p) => p.label === v || p.address === v);
                  if (match && props.suggestions?.onPropertyPicked) props.suggestions.onPropertyPicked(match.id);
                }}
                style={{ ...inputStyle, color: value ? "var(--navy)" : "#5A657A" }}
              />
              <datalist id="th-property-suggestions">
                {props.suggestions!.properties!.map((p) => <option key={p.id} value={p.label} />)}
              </datalist>
            </>
          );
        } else if (key === "room_number" && props.suggestions?.propertyFullyOccupied) {
          // Property has rooms but every one is occupied — don't let staff type a
          // room that'll be rejected at commit. Disable the field with a clear
          // reason; the only way forward is to add a new unit to the property
          // (or pick a different one in the Address / Property field above).
          inputElement = (
            <div>
              <input
                type="text"
                placeholder="All rooms occupied at this property"
                value=""
                disabled
                style={{ ...inputStyle, backgroundColor: "#F7F0EC", color: "#B24A31", fontStyle: "italic", cursor: "not-allowed" }}
              />
              <div style={{ marginTop: "4px", fontSize: "12px", color: "#B24A31" }}>
                ⚠ All {props.suggestions.unitsTotal ?? ""} rooms are occupied. Pick another property or add a new unit first.
              </div>
            </div>
          );
        } else if (key === "room_number" && (props.suggestions?.units?.length ?? 0) > 0) {
          // Rooms belonging to the matched property, FILTERED to available ones only.
          const total = props.suggestions?.unitsTotal ?? props.suggestions!.units!.length;
          const avail = props.suggestions!.units!.length;
          inputElement = (
            <div>
              <input
                type="text"
                list="th-unit-suggestions"
                placeholder={PLACEHOLDERS[key] ?? ""}
                value={String(value)}
                onChange={(e) => {
                  const v = e.target.value;
                  props.onChange?.(key, v);
                  const match = props.suggestions?.units?.find((u) => u.reference === v || u.label === v);
                  if (match && props.suggestions?.onUnitPicked) props.suggestions.onUnitPicked(match.id);
                }}
                style={{ ...inputStyle, color: value ? "var(--navy)" : "#5A657A" }}
              />
              <datalist id="th-unit-suggestions">
                {props.suggestions!.units!.map((u) => <option key={u.id} value={u.reference} label={u.label} />)}
              </datalist>
              {total > avail && (
                <div style={{ marginTop: "4px", fontSize: "12px", color: "#5A657A" }}>
                  {avail} of {total} rooms available — occupied rooms are hidden.
                </div>
              )}
            </div>
          );
        } else {
          inputElement = (
            <input
              type="text"
              placeholder={PLACEHOLDERS[key] ?? ""}
              value={String(value)}
              onChange={(e) => props.onChange?.(key, e.target.value)}
              style={{ ...inputStyle, color: value ? "var(--navy)" : "#5A657A" }}
            />
          );
        }

        return (
          <label key={key} style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--navy)", marginBottom: "4px" }}>
              {label} {low && <span title="Low confidence" style={{ color: "#E8A84C" }}>⚠️</span>}
            </span>
            {inputElement}
            {props.errors?.[key] && (
              <span style={{ display: "block", color: "#E05252", fontSize: "11px", marginTop: "4px" }}>
                {props.errors[key]}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
