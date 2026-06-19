/**
 * AuditStampBar — the 🔒 provenance strip shown at the bottom of every form.
 * Every saved record carries who entered it, when, by what method, and the
 * audit hash (H1). JetBrains Mono for the machine fields.
 */
"use client";

import { truncateHash, formatDateTime } from "../lib/format";

export function AuditStampBar(props: {
  enteredBy?: string | null;
  timestamp?: string | null;
  method?: string | null;
  hash?: string | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        flexWrap: "wrap",
        padding: "12px 16px",
        background: "var(--slate-50)",
        color: "var(--text-muted)",
        border: "1px solid var(--slate-200)",
        borderRadius: "12px",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "11px",
      }}
    >
      <span aria-hidden>🔒</span>
      <span>Entered by: {props.enteredBy ?? "—"}</span>
      <span style={{ opacity: 0.5 }}>·</span>
      <span>{props.timestamp ? formatDateTime(props.timestamp) : "—"}</span>
      <span style={{ opacity: 0.5 }}>·</span>
      <span>Method: {props.method ?? "manual"}</span>
      <span style={{ opacity: 0.5 }}>·</span>
      <span>
        Hash: <span style={{ color: "var(--text-main)", fontWeight: 600 }}>{truncateHash(props.hash)}</span>
      </span>
    </div>
  );
}
