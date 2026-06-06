"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTenants } from "../../../hooks/useTenants";
import { formatDateTime } from "../../../lib/format";

export default function SessionsIndexPage() {
  const { tenants } = useTenants();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
      <h1 style={{ color: "var(--navy)", marginBottom: "24px", margin: 0 }}>All Sessions</h1>
      
      {sessions.length === 0 ? (
        <p style={{ color: "#7A8499" }}>No sessions recorded.</p>
      ) : (
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #EDE8E1", overflow: "hidden" }}>
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
      )}
    </div>
  );
}
