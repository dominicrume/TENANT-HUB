"use client";

import { useState, useEffect, useCallback } from "react";
import { formatShortDate } from "../../../lib/format";
import { FormSection, TextField, SelectField } from "../form/fields";

export function MaintenanceTab({ tenantId, roomNumber }: { tenantId: string; roomNumber?: string }) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // New ticket state
  const [issueType, setIssueType] = useState("Plumbing");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/maintenance?tenantId=${tenantId}`);
    if (res.ok) setTickets(await res.json());
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  async function onSave() {
    if (!desc) return;
    setSaving(true);
    const res = await fetch("/api/maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        room_number: roomNumber || "Unknown",
        issue_type: issueType,
        description: desc
      })
    });
    setSaving(false);
    if (res.ok) {
      setDesc("");
      void load();
    }
  }

  if (loading) return <div style={{ padding: "20px" }}>Loading tickets...</div>;

  return (
    <div style={{ marginTop: "20px" }}>
      <FormSection title="Log New Maintenance Issue">
        <SelectField 
          label="Issue Type" 
          value={issueType} 
          onChange={setIssueType} 
          options={["Plumbing", "Electrical", "Furniture", "Heating/Boiler", "Other"]} 
          required 
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "14px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--navy)" }}>Description *</label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #D9D2C7", fontSize: "13px", minHeight: "80px", boxSizing: "border-box" }}
          />
        </div>
        <button
          onClick={onSave}
          disabled={saving || !desc}
          style={{ minHeight: "44px", padding: "0 24px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: saving || !desc ? "not-allowed" : "pointer" }}
        >
          {saving ? "Logging..." : "Log Issue"}
        </button>
      </FormSection>

      <div style={{ marginTop: "30px" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--navy)", marginBottom: "16px" }}>Room Ticket History</h3>
        {tickets.length === 0 ? (
          <p style={{ fontSize: "13px", color: "#7A8499" }}>No maintenance tickets logged for this tenant.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {tickets.map(t => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px", background: "#F8F4EF", borderRadius: "8px", border: "1px solid #EDE8E1" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--amber)", textTransform: "uppercase" }}>{t.issue_type}</span>
                    <span style={{ fontSize: "10px", padding: "2px 6px", background: t.status === "Resolved" ? "#1E7F4F" : "#E05252", color: "#fff", borderRadius: "4px", fontWeight: 700 }}>{t.status}</span>
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--navy)", margin: 0 }}>{t.description}</p>
                </div>
                <div style={{ textAlign: "right", fontSize: "11px", color: "#7A8499" }}>
                  <div>{formatShortDate(t.created_at)}</div>
                  <div>by {t.reported_by}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
