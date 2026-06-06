"use client";

import Link from "next/link";
import { useTenants } from "../../../hooks/useTenants";

export default function TenantsIndexPage() {
  const { tenants, loading, error } = useTenants();

  if (loading) return <div style={{ padding: "32px", fontFamily: "'Sora', sans-serif" }}>Loading tenants...</div>;
  if (error) return <div style={{ padding: "32px", color: "red", fontFamily: "'Sora', sans-serif" }}>Error: {error}</div>;

  return (
    <div style={{ padding: "32px", fontFamily: "'Sora', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ color: "var(--navy)", margin: 0 }}>Tenants Directory</h1>
        <Link href="/intake/new" style={{ background: "var(--amber)", color: "var(--navy)", padding: "8px 16px", borderRadius: "8px", textDecoration: "none", fontWeight: 700, fontSize: "14px" }}>
          + New Tenant
        </Link>
      </div>
      
      {tenants.length === 0 ? (
        <p style={{ color: "#7A8499" }}>No tenants found.</p>
      ) : (
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #EDE8E1", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#F8F4EF", color: "#7A8499", textAlign: "left" }}>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Name</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Room</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>NINO</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Benefit</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => (
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
                  <td style={{ padding: "12px 16px", color: "#475569", fontFamily: "monospace" }}>{t.nino || "—"}</td>
                  <td style={{ padding: "12px 16px", color: "#475569" }}>{t.benefit_type || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
