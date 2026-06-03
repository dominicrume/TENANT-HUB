/**
 * TenantSidebar — the active-tenant list.
 * Uses the SAME useTenants() hook as StatsWidget, so list length always equals
 * the headline count (H8 parity).
 *
 * H8 resilience: a background refetch (loading === true while we already hold
 * tenants) must NEVER blank a populated list. We only show the skeleton on the
 * very first load, when there is nothing to show yet.
 */
"use client";

import { useTenants } from "../hooks/useTenants";

export function TenantSidebar() {
  const { activeTenants, loading, error } = useTenants();
  const firstLoad = loading && activeTenants.length === 0;

  return (
    <aside
      style={{
        background: "var(--navy)",
        color: "var(--surface)",
        width: "260px",
        minHeight: "100vh",
        padding: "24px 16px",
        fontFamily: "'Sora', sans-serif",
      }}
    >
      <div
        style={{
          fontSize: "12px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--amber)",
          marginBottom: "16px",
        }}
      >
        Tenants
      </div>

      {error ? (
        <div style={{ color: "#F0A0A0", fontSize: "13px" }}>{error}</div>
      ) : firstLoad ? (
        <div style={{ color: "#9AA6BC", fontSize: "13px" }}>Loading…</div>
      ) : activeTenants.length === 0 ? (
        <div style={{ color: "#9AA6BC", fontSize: "13px" }}>No active tenants</div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {activeTenants.map((t) => (
            <li
              key={t.id}
              style={{
                padding: "10px 12px",
                borderRadius: "8px",
                marginBottom: "4px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
              }}
            >
              <span style={{ fontSize: "14px", fontWeight: 500 }}>{t.full_name}</span>
              <span
                style={{
                  fontSize: "11px",
                  color: "#9AA6BC",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {t.room_number}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
