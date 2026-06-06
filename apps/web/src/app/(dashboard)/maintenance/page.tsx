"use client";

import { useState, useEffect, useCallback } from "react";
import { formatShortDate } from "../../../lib/format";

export default function MaintenancePage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/maintenance");
    if (res.ok) setTickets(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div style={{ padding: "1.75rem" }}>Loading maintenance board...</div>;

  return (
    <div style={{ padding: "1.75rem", fontFamily: "'Sora', sans-serif" }}>
      <h1 style={{ color: "var(--navy)", fontSize: "22px", fontWeight: 700, marginBottom: "20px" }}>
        Maintenance & Repairs
      </h1>
      
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
        {["Open", "Assigned", "Resolved"].map(status => (
          <div key={status} style={{ background: "#F8F4EF", borderRadius: "12px", padding: "16px", minHeight: "60vh" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--navy)", marginBottom: "16px", borderBottom: "2px solid #EDE8E1", paddingBottom: "8px" }}>
              {status} Tickets
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {tickets.filter(t => t.status === status).map(ticket => (
                <div key={ticket.id} style={{ background: "#fff", padding: "14px", borderRadius: "8px", border: "1px solid #EDE8E1", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--amber)", textTransform: "uppercase" }}>{ticket.issue_type}</span>
                    <span style={{ fontSize: "11px", color: "#7A8499" }}>{formatShortDate(ticket.created_at)}</span>
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--navy)", fontWeight: 600, margin: "0 0 6px 0" }}>{ticket.description}</p>
                  <p style={{ fontSize: "12px", color: "#7A8499", margin: "0" }}>
                    Room: <strong>{ticket.room_number}</strong>
                    {ticket.tenant?.full_name ? ` · ${ticket.tenant.full_name}` : ""}
                  </p>
                </div>
              ))}
              {tickets.filter(t => t.status === status).length === 0 && (
                <p style={{ fontSize: "12px", color: "#7A8499", fontStyle: "italic", textAlign: "center", padding: "20px 0" }}>No tickets</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
