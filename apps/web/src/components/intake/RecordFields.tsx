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

export function RecordFields(props: {
  data: Record<string, unknown>;
  onChange?: (key: string, value: string) => void;
  readOnly?: boolean;
  large?: boolean;
  confidence?: Record<string, string>;
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
          </label>
        );
      })}
    </div>
  );
}
