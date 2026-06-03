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
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
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
                  gap: "10px",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  marginBottom: "2px",
                  textDecoration: "none",
                  borderLeft: active ? "3px solid var(--amber)" : "3px solid transparent",
                  background: active ? "rgba(232,168,76,0.12)" : "transparent",
                }}
              >
                <span
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "50%",
                    background: "var(--navy)",
                    border: "1px solid rgba(232,168,76,0.5)",
                    color: "var(--amber)",
                    fontSize: "11px",
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
                      fontWeight: 500,
                      color: "#fff",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {t.full_name}
                  </span>
                  <span style={{ display: "block", fontSize: "11px", color: "#9AA6BC" }}>
                    {t.room_number} · {t.benefit_type}
                  </span>
                </span>
                {t.is_active && (
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "#34C87A",
                      flexShrink: 0,
                    }}
                  />
                )}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
