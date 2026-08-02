"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTenants } from "../../../hooks/useTenants";
import { formatDateTime } from "../../../lib/format";

export default function SessionsIndexPage() {
  const { tenants } = useTenants();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"history" | "quarterly">("history");

  useEffect(() => {
    fetch("/api/sessions")
      .then(res => res.ok ? res.json() : [])
      .then(data => setSessions(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: "32px", fontFamily: "'Sora', sans-serif" }}>Loading sessions...</div>;

  return (
    <div style={{ padding: "32px", fontFamily: "'Sora', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ color: "var(--navy)", margin: 0 }}>All Sessions</h1>
        <div style={{ display: "flex", background: "#f3f4f6", borderRadius: "8px", padding: "4px" }}>
          <button 
            onClick={() => setViewMode("history")}
            style={{ padding: "8px 16px", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 600, cursor: "pointer", background: viewMode === "history" ? "#fff" : "transparent", color: viewMode === "history" ? "var(--navy)" : "#6b7280", boxShadow: viewMode === "history" ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}
          >
            Chronological
          </button>
          <button 
            onClick={() => setViewMode("quarterly")}
            style={{ padding: "8px 16px", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 600, cursor: "pointer", background: viewMode === "quarterly" ? "#fff" : "transparent", color: viewMode === "quarterly" ? "var(--navy)" : "#6b7280", boxShadow: viewMode === "quarterly" ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}
          >
            Quarterly Summary
          </button>
        </div>
      </div>
      
      {sessions.length === 0 ? (
        <p style={{ color: "#7A8499" }}>No sessions recorded.</p>
      ) : viewMode === "history" ? (
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #EDE8E1", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#F8F4EF", color: "#7A8499", textAlign: "left" }}>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Date</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Tenant</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Type</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Entered By</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => {
                const tenantName = tenants.find(t => t.id === s.tenant_id)?.full_name ?? "Unknown";
                return (
                  <tr key={s.id} style={{ borderTop: "1px solid #EDE8E1" }}>
                    <td style={{ padding: "12px 16px", color: "var(--navy)", fontWeight: 500 }}>
                      {formatDateTime(s.created_at)}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <Link href={`/tenants/${s.tenant_id}?tab=sessions`} style={{ color: "var(--navy)", fontWeight: 600, textDecoration: "none" }}>
                        {tenantName}
                      </Link>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#475569", textTransform: "capitalize" }}>
                      {s.session_type}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#475569" }}>
                      {s.entered_by_name}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {Object.entries(sessions.reduce((acc, s) => {
            const d = new Date(s.created_at);
            const q = Math.floor(d.getMonth() / 3) + 1;
            const y = d.getFullYear();
            const key = `Q${q} ${y}`;
            if (!acc[key]) acc[key] = { sessions: 0, daily: 0, weekly: 0, monthly: 0, tenants: new Set() };
            acc[key].sessions++;
            acc[key][s.session_type]++;
            acc[key].tenants.add(s.tenant_id);
            return acc;
          }, {} as Record<string, any>)).map(([quarter, stats]: [string, any]) => (
            <div key={quarter} style={{ background: "var(--surface)", border: "1px solid #EDE8E1", padding: "20px", borderRadius: "12px", borderTop: "4px solid var(--navy)" }}>
              <h4 style={{ margin: "0 0 16px 0", color: "var(--navy)", fontSize: "16px", fontWeight: 700 }}>{quarter} Organization Summary</h4>
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", flex: "1 1 120px" }}>
                  <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Total Sessions</div>
                  <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--navy)" }}>{stats.sessions}</div>
                </div>
                <div style={{ background: "#f5f3ff", padding: "16px", borderRadius: "8px", flex: "1 1 120px" }}>
                  <div style={{ fontSize: "12px", color: "#7c3aed", textTransform: "uppercase", fontWeight: 600 }}>Tenants Seen</div>
                  <div style={{ fontSize: "28px", fontWeight: 700, color: "#5b21b6" }}>{stats.tenants.size}</div>
                </div>
                <div style={{ background: "#fffbeb", padding: "16px", borderRadius: "8px", flex: "1 1 120px" }}>
                  <div style={{ fontSize: "12px", color: "#b45309", textTransform: "uppercase", fontWeight: 600 }}>Daily Logs</div>
                  <div style={{ fontSize: "28px", fontWeight: 700, color: "#92400e" }}>{stats.daily}</div>
                </div>
                <div style={{ background: "#f0fdfa", padding: "16px", borderRadius: "8px", flex: "1 1 120px" }}>
                  <div style={{ fontSize: "12px", color: "#0f766e", textTransform: "uppercase", fontWeight: 600 }}>Weekly Logs</div>
                  <div style={{ fontSize: "28px", fontWeight: 700, color: "#115e59" }}>{stats.weekly}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
