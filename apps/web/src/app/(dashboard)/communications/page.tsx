"use client";

import { useState, useEffect, useCallback } from "react";
import { formatShortDate } from "../../../lib/format";
import { useTenants } from "../../../hooks/useTenants";

export default function CommunicationsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { tenants } = useTenants();

  const [busy, setBusy] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [channel, setChannel] = useState("Email");
  const [msgType, setMsgType] = useState("General Update");
  const [content, setContent] = useState("");
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/communications");
    if (res.ok) setLogs(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!content) return;
    setBusy(true);

    const res = await fetch("/api/communications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId || null,
        channel,
        message_type: msgType,
        content
      })
    });
    setBusy(false);
    if (res.ok) {
      setShowModal(false);
      setContent("");
      void load();
    }
  }

  if (loading) return <div style={{ padding: "1.75rem" }}>Loading communications...</div>;

  return (
    <div style={{ padding: "1.75rem", fontFamily: "'Sora', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ color: "var(--navy)", fontSize: "22px", fontWeight: 700, margin: 0 }}>
          Communications
        </h1>
        <button onClick={() => setShowModal(true)} style={{ padding: "10px 20px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
          Send Message
        </button>
      </div>

      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #EDE8E1", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#F8F4EF", color: "#7A8499", textAlign: "left" }}>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>Date Sent</th>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>Tenant</th>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>Channel</th>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>Type</th>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>Message</th>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>Sent By</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: "16px", color: "#7A8499", textAlign: "center" }}>No communication logs found.</td></tr>
            ) : (
              logs.map(log => (
                <tr key={log.id} style={{ borderTop: "1px solid #EDE8E1" }}>
                  <td style={{ padding: "12px 16px", color: "var(--navy)", fontFamily: "'JetBrains Mono', monospace" }}>{formatShortDate(log.sent_at)}</td>
                  <td style={{ padding: "12px 16px", fontWeight: 600, color: "var(--navy)" }}>{log.tenant?.full_name || "All Tenants (Broadcast)"}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ padding: "4px 8px", background: log.channel === "Email" ? "rgba(56,189,248,0.15)" : "rgba(245,158,11,0.15)", color: log.channel === "Email" ? "#0284c7" : "#d97706", borderRadius: "4px", fontSize: "11px", fontWeight: 700 }}>
                      {log.channel}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#475569" }}>{log.message_type}</td>
                  <td style={{ padding: "12px 16px", color: "#475569", maxWidth: "300px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={log.content}>{log.content}</td>
                  <td style={{ padding: "12px 16px", color: "#7A8499" }}>{log.sent_by}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <form onSubmit={handleSend} style={{ background: "#fff", padding: "24px", borderRadius: "12px", width: "450px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <h3 style={{ margin: 0, color: "var(--navy)" }}>Send Communication</h3>
            
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: "12px", color: "#7A8499", display: "block", marginBottom: "4px" }}>Recipient</label>
                <select value={tenantId} onChange={e => setTenantId(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1", boxSizing: "border-box" }}>
                  <option value="">All Tenants (Broadcast)</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: "12px", color: "#7A8499", display: "block", marginBottom: "4px" }}>Channel</label>
                <select value={channel} onChange={e => setChannel(e.target.value)} required style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1", boxSizing: "border-box" }}>
                  <option value="Email">Email</option>
                  <option value="SMS">SMS</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: "12px", color: "#7A8499", display: "block", marginBottom: "4px" }}>Message Type</label>
              <select value={msgType} onChange={e => setMsgType(e.target.value)} required style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1", boxSizing: "border-box" }}>
                <option value="General Update">General Update</option>
                <option value="Arrears Reminder">Arrears Reminder</option>
                <option value="Missing Intake Form">Missing Intake Form</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: "12px", color: "#7A8499", display: "block", marginBottom: "4px" }}>Message Content</label>
              <textarea value={content} onChange={e => setContent(e.target.value)} required placeholder="Type your message here..." style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1", minHeight: "100px", boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px" }}>
              <button type="button" onClick={() => setShowModal(false)} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "transparent", cursor: "pointer", color: "#7A8499", fontWeight: 600 }}>Cancel</button>
              <button type="submit" disabled={busy || !content} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "var(--navy)", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                {busy ? "Sending..." : "Send Message"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
