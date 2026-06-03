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
        padding: "10px 14px",
        background: "var(--navy)",
        color: "#C7CFDD",
        borderRadius: "10px",
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
        Hash: <span style={{ color: "var(--amber)" }}>{truncateHash(props.hash)}</span>
      </span>
    </div>
  );
}
