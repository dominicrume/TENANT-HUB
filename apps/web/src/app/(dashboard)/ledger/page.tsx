"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTenants } from "../../../hooks/useTenants";

export default function LedgerIndexPage() {
  const { tenants } = useTenants();
  const [charges, setCharges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/service-charges")
      .then(res => res.ok ? res.json() : [])
      .then(data => setCharges(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: "32px", fontFamily: "'Sora', sans-serif" }}>Loading ledger...</div>;

  return (
    <div style={{ padding: "32px", fontFamily: "'Sora', sans-serif" }}>
      <h1 style={{ color: "var(--navy)", marginBottom: "24px", margin: 0 }}>Global Ledger</h1>
      
      {charges.length === 0 ? (
        <p style={{ color: "#7A8499" }}>No service charges recorded.</p>
      ) : (
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #EDE8E1", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#F8F4EF", color: "#7A8499", textAlign: "left" }}>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Due Date</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Tenant</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Week Label</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Amount (£)</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {charges.map(c => {
                const tenantName = tenants.find(t => t.id === c.tenant_id)?.full_name ?? "Unknown";
                return (
                  <tr key={c.id} style={{ borderTop: "1px solid #EDE8E1" }}>
                    <td style={{ padding: "12px 16px", color: "var(--navy)", fontWeight: 500 }}>
                      {c.due_date}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <Link href={`/tenants/${c.tenant_id}?tab=ledger`} style={{ color: "var(--navy)", fontWeight: 600, textDecoration: "none" }}>
                        {tenantName}
                      </Link>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#475569" }}>
                      {c.week_label}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#475569" }}>
                      £{c.amount}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ 
                        padding: "4px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700,
                        background: c.is_paid ? "rgba(52,200,122,0.15)" : "rgba(224,82,82,0.15)",
                        color: c.is_paid ? "#2CA162" : "#E05252"
                      }}>
                        {c.is_paid ? "PAID" : "UNPAID"}
                      </span>
                    </td>
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
