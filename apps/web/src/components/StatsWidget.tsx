/**
 * StatsWidget — active-tenant headline count.
 * Derives ENTIRELY from useTenants(). The sidebar uses the same hook, so the
 * number shown here can never disagree with the list length (H8 parity).
 */
"use client";

import { useTenants } from "../hooks/useTenants";

export function StatsWidget() {
  const { count, loading, error } = useTenants();

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid #EDE8E1",
        borderRadius: "12px",
        padding: "20px 24px",
        minWidth: "200px",
      }}
    >
      <div
        style={{
          color: "#7A8499",
          fontSize: "12px",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        Active Tenants
      </div>

      {error ? (
        <div style={{ color: "#E05252", fontSize: "13px", marginTop: "8px" }}>
          {error}
        </div>
      ) : (
        <div
          style={{
            color: "var(--navy)",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "34px",
            fontWeight: 600,
            marginTop: "6px",
            opacity: loading ? 0.4 : 1,
          }}
        >
          {loading ? "—" : count}
        </div>
      )}
    </div>
  );
}
