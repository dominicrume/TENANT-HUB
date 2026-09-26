/**
 * LetterheadBlock — official document header used on the tenant detail form,
 * intake, reports and the eviction notice. Brand comes from BrandContext so one
 * click reletterheads every document. The switcher lives here, on the document
 * that carries the letterhead, not in the console chrome (BUILD_PLAN C03). It is
 * hidden in print. Always shows the OFFICIAL USE ONLY badge.
 */
"use client";

import { useBrand, BRAND_LABELS, type Brand } from "../contexts/BrandContext";

const SHORT: Record<Brand, string> = { mattys_place: "Matty's", reliance: "Reliance" };

export function LetterheadBlock({ roomNumber, date, switchable = true }: { roomNumber?: string; date?: string; switchable?: boolean }) {
  const { brand, setBrand, label } = useBrand();
  const letter = label.charAt(0).toUpperCase();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "14px 16px",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "12px",
        flexWrap: "wrap",
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
        <div style={{ color: "var(--slate-2)", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>
          {[roomNumber, date].filter(Boolean).join("  ·  ") || "Official record"}
        </div>
      </div>

      {switchable && (
        <div className="no-print" role="group" aria-label="Letterhead" style={{ display: "flex", gap: "4px" }}>
          {(Object.keys(BRAND_LABELS) as Brand[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBrand(b)}
              title={`Use the ${BRAND_LABELS[b]} letterhead`}
              aria-pressed={brand === b}
              style={{
                minHeight: "36px",
                padding: "6px 10px",
                borderRadius: "8px",
                border: brand === b ? "1.5px solid var(--navy)" : "1.5px solid var(--line)",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 600,
                fontFamily: "'Sora',sans-serif",
                background: brand === b ? "var(--navy)" : "var(--surface)",
                color: brand === b ? "#fff" : "var(--navy)",
              }}
            >
              {SHORT[b]}
            </button>
          ))}
        </div>
      )}

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
