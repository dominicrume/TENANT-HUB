/**
 * LetterheadBlock — official document header used on the tenant detail form,
 * intake, reports and the eviction notice. Always shows the OFFICIAL USE ONLY
 * badge.
 *
 * Brand comes from the REAL, active organisation (AuthContext), not a
 * manually-clickable picker. It used to be switchable (BrandContext, a
 * cosmetic preference stored in localStorage, independent of which org was
 * actually active) — that's what let a document say "On behalf of Matty's
 * Place" while the signed-in workspace was genuinely Reliance Housing: a
 * wrong legal document, not just a confusing label. Once real, isolated
 * organisations existed (BUILD_PLAN C46 / the multi-org workspace picker),
 * a second, disconnected "which brand" picker had no reason to still exist,
 * so it's gone — the letterhead is always whichever org you're actually
 * signed into, with nothing to pick.
 */
"use client";

import { useAuth } from "../contexts/AuthContext";

export function LetterheadBlock({ roomNumber, date }: { roomNumber?: string; date?: string }) {
  const { profile } = useAuth();
  const name = profile?.org_name ?? "Tenant Hub";
  const letter = name.charAt(0).toUpperCase();

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
          {name}
        </div>
        <div style={{ color: "var(--slate-2)", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>
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
