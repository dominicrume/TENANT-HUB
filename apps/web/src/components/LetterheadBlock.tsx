/**
 * LetterheadBlock — official document header used on the tenant detail form,
 * intake, reports and the eviction notice. Brand comes from BrandContext so one
 * click reletterheads every document. Always shows the OFFICIAL USE ONLY badge.
 */
"use client";

import { useBrand } from "../contexts/BrandContext";

export function LetterheadBlock({ roomNumber, date }: { roomNumber?: string; date?: string }) {
  const { label } = useBrand();
  const letter = label.charAt(0).toUpperCase();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "14px 16px",
        background: "var(--surface)",
        border: "1px solid #EDE8E1",
        borderRadius: "12px",
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "10px",
          background: "var(--navy)",
          color: "var(--amber)",
          fontFamily: "'Sora', sans-serif",
          fontWeight: 800,
          fontSize: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {letter}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "var(--navy)", fontWeight: 700, fontSize: "16px", fontFamily: "'Sora', sans-serif" }}>
          {label}
        </div>
        <div style={{ color: "#7A8499", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>
          {[roomNumber, date].filter(Boolean).join("  ·  ") || "Official record"}
        </div>
      </div>

      <span
        style={{
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: "var(--navy)",
          background: "var(--amber)",
          padding: "5px 9px",
          borderRadius: "6px",
          whiteSpace: "nowrap",
        }}
      >
        OFFICIAL USE ONLY
      </span>
    </div>
  );
}
