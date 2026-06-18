"use client";

import { useState } from "react";
import Link from "next/link";
import { useTenants } from "../../../hooks/useTenants";

export default function TenantsIndexPage() {
  const { tenants, loading, error } = useTenants();
  const [filter, setFilter] = useState<"all" | "active" | "in_progress" | "suspended">("all");

  if (loading) return <div style={{ padding: "32px", fontFamily: "'Sora', sans-serif" }}>Loading tenants...</div>;
  if (error) return <div style={{ padding: "32px", color: "red", fontFamily: "'Sora', sans-serif" }}>Error: {error}</div>;

  const filteredTenants = tenants
    .filter(t => filter === "all" || t.housing_benefit_status === filter)
    .sort((a, b) => {
      // Sort Red -> Orange -> Green
      const order = { suspended: 0, in_progress: 1, active: 2 };
      const aVal = order[a.housing_benefit_status as keyof typeof order] ?? 3;
      const bVal = order[b.housing_benefit_status as keyof typeof order] ?? 3;
      if (aVal !== bVal) return aVal - bVal;
      return a.full_name.localeCompare(b.full_name);
    });

  const getHbColor = (status: string) => {
    if (status === "active") return { bg: "rgba(52,200,122,0.15)", text: "#2CA162", label: "ACTIVE" };
    if (status === "suspended") return { bg: "rgba(224,82,82,0.15)", text: "#E05252", label: "PROBLEM" };
    return { bg: "rgba(245,166,35,0.15)", text: "#D08816", label: "IN PROGRESS" }; // Amber/Orange
  };

  return (
    <div style={{ padding: "32px", fontFamily: "'Sora', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ color: "var(--navy)", margin: 0 }}>Housing Benefit Triage</h1>
        <Link href="/intake/new" style={{ background: "var(--amber)", color: "var(--navy)", padding: "8px 16px", borderRadius: "8px", textDecoration: "none", fontWeight: 700, fontSize: "14px" }}>
          + New Tenant
        </Link>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {(["all", "suspended", "in_progress", "active"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, border: "none", cursor: "pointer",
              background: filter === f ? "var(--navy)" : "#fff",
              color: filter === f ? "#fff" : "var(--navy)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
            }}
          >
            {f === "all" ? "All Tenants" : f === "suspended" ? "Red (Action Required)" : f === "in_progress" ? "Orange (In Progress)" : "Green (Active)"}
          </button>
        ))}
      </div>
      
      {filteredTenants.length === 0 ? (
        <p style={{ color: "#7A8499" }}>No tenants match this filter.</p>
      ) : (
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #EDE8E1", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#F8F4EF", color: "#7A8499", textAlign: "left" }}>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Name</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Room</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Tenant Status</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Housing Benefit</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>NINO</th>
              </tr>
            </thead>
            <tbody>
              {filteredTenants.map(t => {
                const hbColor = getHbColor(t.housing_benefit_status);
                return (
                  <tr key={t.id} style={{ borderTop: "1px solid #EDE8E1" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <Link href={`/tenants/${t.id}`} style={{ color: "var(--navy)", fontWeight: 600, textDecoration: "none" }}>
                        {t.full_name}
                      </Link>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#475569" }}>{t.room_number || "—"}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ 
                        padding: "4px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700,
                        background: t.is_active ? "rgba(52,200,122,0.15)" : "rgba(122,132,153,0.15)",
                        color: t.is_active ? "#2CA162" : "#7A8499"
                      }}>
                        {t.is_active ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ 
                        padding: "4px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700,
                        background: hbColor.bg, color: hbColor.text
                      }}>
                        {hbColor.label}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#475569", fontFamily: "monospace" }}>{t.nino || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
