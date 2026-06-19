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
            color: "var(--text-muted)",
          }}
        >
          Tenants
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
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
          padding: "8px 12px",
          marginBottom: "12px",
          borderRadius: "10px",
          border: "1px solid var(--slate-200)",
          background: "var(--slate-50)",
          color: "var(--text-main)",
          fontSize: "13px",
          boxSizing: "border-box",
        }}
      />

      <div style={{ overflowY: "auto", flex: 1 }}>
        {error ? (
          <div style={{ color: "var(--rose-500)", fontSize: "13px", padding: "8px 4px" }}>{error}</div>
        ) : firstLoad ? (
          <div style={{ color: "var(--text-muted)", fontSize: "13px", padding: "8px 4px" }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: "13px", padding: "8px 4px" }}>
            {activeTenants.length === 0 ? "0 Active" : "No matches"}
          </div>
        ) : (
          filtered.map((t) => {
            const active = pathname === `/tenants/${t.id}`;
            return (
              <Link
                key={t.id}
                href={`/tenants/${t.id}`}
                className="hover:bg-slate-50 transition-colors"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  marginBottom: "4px",
                  textDecoration: "none",
                  flexShrink: 0,
                  background: active ? "var(--indigo-50)" : "transparent",
                }}
              >
                <span
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: active ? "var(--accent)" : "var(--slate-100)",
                    border: active ? "none" : "1px solid var(--slate-200)",
                    color: active ? "#fff" : "var(--slate-600)",
                    fontSize: "13px",
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
                      fontSize: "14px",
                      fontWeight: active ? 600 : 500,
                      color: active ? "var(--accent)" : "var(--text-main)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      letterSpacing: "0.01em",
                      marginBottom: "2px"
                    }}
                  >
                    {t.full_name}
                  </span>
                  <span style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {t.room_number} · {t.benefit_type}
                  </span>
                </span>
                {t.is_active && (
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background:
                        t.housing_benefit_status === "active" ? "var(--emerald-500)" : // Green
                        t.housing_benefit_status === "suspended" ? "var(--rose-500)" : // Red
                        "#F59E0B", // Amber
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
