/**
 * TenantSidebar — the active-tenant list inside the dashboard sidebar.
 * Uses useTenants() — the SAME hook the dashboard stats use, so the count here
 * can never disagree with the dashboard (H8). Search filters client-side (no
 * extra API call). A background refetch never blanks a populated list (H8).
 */
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTenants } from "../../hooks/useTenants";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function TenantSidebar() {
  const { activeTenants, count, loading, error } = useTenants();
  const [q, setQ] = useState("");
  const pathname = usePathname();

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return activeTenants;
    return activeTenants.filter(
      (t) =>
        t.full_name.toLowerCase().includes(term) ||
        t.room_number.toLowerCase().includes(term),
    );
  }, [activeTenants, q]);

  const firstLoad = loading && activeTenants.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "250px", flex: 1 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 4px 8px",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--amber)",
          }}
        >
          Tenants
        </span>
        <span style={{ fontSize: "11px", color: "#9AA6BC", fontFamily: "'JetBrains Mono', monospace" }}>
          {count} Active
        </span>
      </div>

      <input
        placeholder="Search tenants…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{
          width: "100%",
          minHeight: "36px",
          padding: "6px 10px",
          marginBottom: "8px",
          borderRadius: "8px",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.06)",
          color: "#fff",
          fontSize: "12px",
          boxSizing: "border-box",
        }}
      />

      <div style={{ overflowY: "auto", flex: 1 }}>
        {error ? (
          <div style={{ color: "#F0A0A0", fontSize: "12px", padding: "8px 4px" }}>{error}</div>
        ) : firstLoad ? (
          <div style={{ color: "#9AA6BC", fontSize: "12px", padding: "8px 4px" }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "#9AA6BC", fontSize: "12px", padding: "8px 4px" }}>
            {activeTenants.length === 0 ? "0 Active" : "No matches"}
          </div>
        ) : (
          filtered.map((t) => {
            const active = pathname === `/tenants/${t.id}`;
            return (
              <Link
                key={t.id}
                href={`/tenants/${t.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 14px",
                  borderRadius: "8px",
                  marginBottom: "6px",
                  textDecoration: "none",
                  flexShrink: 0,
                  borderLeft: active ? "3px solid var(--amber)" : "3px solid transparent",
                  background: active ? "rgba(232,168,76,0.12)" : "transparent",
                  transition: "background 0.2s ease",
                }}
              >
                <span
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "50%",
                    background: "var(--navy)",
                    border: "1px solid rgba(232,168,76,0.5)",
                    color: "var(--amber)",
                    fontSize: "12px",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {initials(t.full_name)}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#fff",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      letterSpacing: "0.01em",
                      marginBottom: "2px"
                    }}
                  >
                    {t.full_name}
                  </span>
                  <span style={{ display: "block", fontSize: "11px", color: "#9AA6BC", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {t.room_number} · {t.benefit_type}
                  </span>
                </span>
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background:
                      t.is_archived ? "#9CA3AF" : // Gray
                      t.housing_benefit_status === "active" ? "#34C87A" : // Green
                      t.housing_benefit_status === "suspended" ? "#E05252" : // Red
                      "var(--amber)", // Orange (in progress)
                    flexShrink: 0,
                  }}
                />
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
