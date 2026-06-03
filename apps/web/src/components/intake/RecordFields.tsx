/**
 * RecordFields — renders the intake record from FIELD_LABELS, either editable
 * or read-only (used by extract, review and verify). Low-confidence OCR fields
 * get an amber border + ⚠️.
 */
"use client";

import { FIELD_LABELS } from "../../lib/intake";

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
        return (
          <label key={key} style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--navy)", marginBottom: "4px" }}>
              {label} {low && <span title="Low confidence" style={{ color: "#E8A84C" }}>⚠️</span>}
            </span>
            {props.readOnly ? (
              <div style={{ fontSize, color: String(value) ? "var(--navy)" : "#9AA6BC", padding: "8px 0", fontWeight: props.large ? 600 : 400 }}>
                {String(value) || "—"}
              </div>
            ) : (
              <input
                value={String(value)}
                onChange={(e) => props.onChange?.(key, e.target.value)}
                style={{
                  width: "100%", minHeight: "44px", padding: "9px 11px", borderRadius: "8px",
                  border: low ? "1px solid #E8A84C" : "1px solid #EDE8E1",
                  fontFamily: "'Sora',sans-serif", fontSize: "14px", boxSizing: "border-box",
                }}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
