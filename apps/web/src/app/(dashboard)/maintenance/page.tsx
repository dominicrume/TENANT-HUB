"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { formatShortDate } from "../../../lib/format";
import { getSupabaseBrowser, hasSupabaseBrowser } from "../../../lib/supabase-browser";

const SEVERITY_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  emergency: { bg: "rgba(178,74,49,.14)", color: "var(--brick)", label: "Emergency" },
  urgent:    { bg: "rgba(178,74,49,.08)", color: "var(--brick)", label: "Urgent" },
  routine:   { bg: "rgba(232,168,76,.16)", color: "var(--amber-deep)", label: "Routine" },
  cosmetic:  { bg: "rgba(92,102,115,.10)", color: "var(--slate)", label: "Cosmetic" },
};

export default function MaintenancePage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showTrades, setShowTrades] = useState(false);
  const [busy, setBusy] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);

  // New ticket state
  const [issueType, setIssueType] = useState("Plumbing");
  const [roomNumber, setRoomNumber] = useState("");
  const [desc, setDesc] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [assignedTo, setAssignedTo] = useState("");

  // New trade state
  const [tradeName, setTradeName] = useState("");
  const [tradeCategory, setTradeCategory] = useState("Plumbing");
  const [tradeEmail, setTradeEmail] = useState("");
  const [tradePhone, setTradePhone] = useState("");
  const [tradeEmergency, setTradeEmergency] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [tRes, pRes, trRes] = await Promise.all([
      fetch("/api/maintenance"),
      fetch("/api/profiles"),
      fetch("/api/trades"),
    ]);
    if (tRes.ok) setTickets(await tRes.json());
    if (pRes.ok) setProfiles(await pRes.json());
    if (trRes.ok) setTrades(await trRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleAddTrade(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setTradeError(null);
    const res = await fetch("/api/trades", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: tradeName, category: tradeCategory,
        contact_email: tradeEmail || null, contact_phone: tradePhone || null,
        is_emergency_capable: tradeEmergency,
      }),
    });
    setBusy(false);
    if (!res.ok) { const b = await res.json().catch(() => null); setTradeError(b?.error ?? "Could not save the trade"); return; }
    setTradeName(""); setTradeEmail(""); setTradePhone(""); setTradeEmergency(false);
    void load(); // trades stays populated with the old list until this resolves (H8)
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!desc || !roomNumber) return;
    setBusy(true);

    let photo_url = null;
    if (photoFile && hasSupabaseBrowser()) {
      const ext = photoFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;
      const { data, error } = await getSupabaseBrowser().storage.from("maintenance-photos").upload(fileName, photoFile);
      if (!error && data) {
        photo_url = data.path;
      }
    }

    const res = await fetch("/api/maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_number: roomNumber,
        issue_type: issueType,
        description: desc,
        assigned_to: assignedTo || null,
        photo_url
      })
    });
    setBusy(false);
    if (res.ok) {
      setShowModal(false);
      setDesc("");
      setRoomNumber("");
      setPhotoFile(null);
      setAssignedTo("");
      void load();
    }
  }

  async function updateTicket(id: string, updates: any) {
    setBusy(true);
    setBoardError(null);
    try {
      const res = await fetch(`/api/maintenance/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        setBoardError(b?.error ?? "That change didn't save. Nothing was updated — try again.");
        return;
      }
    } catch {
      setBoardError("Could not reach the server. Nothing was updated — try again.");
      return;
    } finally {
      setBusy(false);
    }
    void load();
  }

  if (loading) return <div style={{ padding: "1.75rem" }}>Loading maintenance board...</div>;

  return (
    <div style={{ padding: "1.75rem", fontFamily: "'Sora', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ color: "var(--navy)", fontSize: "22px", fontWeight: 700, margin: 0 }}>
          Maintenance & Repairs
        </h1>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={() => setShowTrades(true)} style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid var(--navy)", background: "transparent", color: "var(--navy)", cursor: "pointer", fontWeight: 600 }}>
            Trades
          </button>
          <button onClick={() => setShowModal(true)} style={{ padding: "10px 20px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
            + New Ticket
          </button>
        </div>
      </div>

      {boardError && (
        <p style={{ color: "var(--brick)", background: "rgba(178,74,49,.08)", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
          {boardError}
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px", alignItems: "start" }}>
        {["Open", "Assigned", "Resolved"].map(status => (
          <div key={status} style={{ background: "#F8F4EF", borderRadius: "12px", padding: "16px", minHeight: "60vh" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--navy)", marginBottom: "16px", borderBottom: "2px solid #EDE8E1", paddingBottom: "8px" }}>
              {status} Tickets
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {tickets.filter(t => t.status === status).map(ticket => (
                <div key={ticket.id} style={{ background: "#fff", padding: "14px", borderRadius: "8px", border: "1px solid #EDE8E1", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--amber)", textTransform: "uppercase" }}>{ticket.category || ticket.issue_type}</span>
                    <span style={{ fontSize: "11px", color: "#7A8499" }}>{formatShortDate(ticket.created_at)}</span>
                  </div>
                  {ticket.severity && (
                    <span style={{
                      display: "inline-block", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: 999, marginBottom: "8px",
                      background: SEVERITY_STYLE[ticket.severity]?.bg, color: SEVERITY_STYLE[ticket.severity]?.color,
                    }}>
                      {SEVERITY_STYLE[ticket.severity]?.label ?? ticket.severity}
                    </span>
                  )}
                  <p style={{ fontSize: "13px", color: "var(--navy)", fontWeight: 600, margin: "0 0 6px 0" }}>{ticket.description}</p>
                  {ticket.triage_reasoning && (
                    <p style={{ fontSize: "11.5px", color: "#7A8499", fontStyle: "italic", margin: "0 0 8px 0" }}>{ticket.triage_reasoning}</p>
                  )}
                  <p style={{ fontSize: "12px", color: "#7A8499", margin: "0 0 10px 0" }}>
                    Room: <strong>{ticket.room_number}</strong>
                    {ticket.tenant?.full_name ? ` · ${ticket.tenant.full_name}` : ""}
                    {ticket.reported_via === "qr" ? " · via wall QR" : ""}
                  </p>

                  {ticket.photo_url && hasSupabaseBrowser() && (
                    <div style={{ marginBottom: "10px", position: "relative", height: "120px", width: "100%" }}>
                      <Image
                        src={getSupabaseBrowser().storage.from("maintenance-photos").getPublicUrl(ticket.photo_url).data.publicUrl}
                        alt="Issue"
                        fill
                        style={{ objectFit: "cover", borderRadius: "6px" }}
                      />
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px", borderTop: "1px solid #EDE8E1", paddingTop: "10px" }}>
                    <select 
                      value={ticket.assigned_to || ""} 
                      onChange={e => updateTicket(ticket.id, { assigned_to: e.target.value || null, status: e.target.value ? "Assigned" : "Open" })}
                      disabled={busy || ticket.status === "Resolved"}
                      style={{ padding: "6px", fontSize: "12px", borderRadius: "4px", border: "1px solid #EDE8E1" }}
                    >
                      <option value="">Unassigned</option>
                      {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <button 
                        onClick={() => updateTicket(ticket.id, { status: "Resolved" })}
                        disabled={busy || ticket.status === "Resolved"}
                        style={{ flex: 1, padding: "6px", fontSize: "12px", background: ticket.status === "Resolved" ? "#1E7F4F" : "#fff", color: ticket.status === "Resolved" ? "#fff" : "#1E7F4F", border: "1px solid #1E7F4F", borderRadius: "4px", cursor: "pointer", fontWeight: 600 }}
                      >
                        {ticket.status === "Resolved" ? "Resolved" : "Mark Resolved"}
                      </button>
                      {ticket.status === "Resolved" && (
                        <button 
                          onClick={() => updateTicket(ticket.id, { status: ticket.assigned_to ? "Assigned" : "Open" })}
                          disabled={busy}
                          style={{ padding: "6px", fontSize: "12px", background: "#fff", color: "#7A8499", border: "1px solid #EDE8E1", borderRadius: "4px", cursor: "pointer" }}
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {tickets.filter(t => t.status === status).length === 0 && (
                <p style={{ fontSize: "12px", color: "#7A8499", fontStyle: "italic", textAlign: "center", padding: "20px 0" }}>No tickets</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <form onSubmit={handleCreate} style={{ background: "#fff", padding: "24px", borderRadius: "12px", width: "400px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <h3 style={{ margin: 0, color: "var(--navy)" }}>Log New Ticket</h3>
            <div style={{ display: "flex", gap: "12px" }}>
              <input value={roomNumber} onChange={e => setRoomNumber(e.target.value)} placeholder="Room Number *" required style={{ flex: 1, padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1" }} />
              <select value={issueType} onChange={e => setIssueType(e.target.value)} required style={{ flex: 1, padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1" }}>
                <option value="Plumbing">Plumbing</option>
                <option value="Electrical">Electrical</option>
                <option value="Furniture">Furniture</option>
                <option value="Heating/Boiler">Heating/Boiler</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description *" required style={{ padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1", minHeight: "80px" }} />
            
            <div style={{ border: "1px dashed #EDE8E1", padding: "12px", borderRadius: "6px" }}>
              <label style={{ fontSize: "12px", color: "#7A8499", display: "block", marginBottom: "8px" }}>Attach Photo (Optional)</label>
              {hasSupabaseBrowser() ? (
                <input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0] || null)} style={{ fontSize: "12px" }} />
              ) : (
                <p style={{ fontSize: "12px", color: "#7A8499", fontStyle: "italic", margin: 0 }}>Photo attachments aren&apos;t available on this environment yet — the ticket still saves without one.</p>
              )}
            </div>

            <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} style={{ padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1" }}>
              <option value="">Unassigned</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px" }}>
              <button type="button" onClick={() => setShowModal(false)} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "transparent", cursor: "pointer", color: "#7A8499", fontWeight: 600 }}>Cancel</button>
              <button type="submit" disabled={busy || !desc || !roomNumber} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "var(--navy)", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                {busy ? "Saving..." : "Create Ticket"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showTrades && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15,28,46,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }} onClick={() => setShowTrades(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", padding: "24px", borderRadius: "12px", width: "420px", maxHeight: "80vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>
            <h3 style={{ margin: 0, color: "var(--navy)" }}>Trades</h3>
            <p style={{ fontSize: "12px", color: "#7A8499", margin: 0 }}>Who a repair gets sent to. issue-triage picks one of these by category, or &quot;general&quot; as a fallback.</p>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {trades.length === 0 && <p style={{ fontSize: "12px", color: "#7A8499", fontStyle: "italic" }}>No trades yet — add the first one below.</p>}
              {trades.map((t) => (
                <div key={t.id} style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #EDE8E1", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: "13px", color: "var(--navy)" }}>{t.name}</p>
                    <p style={{ margin: 0, fontSize: "11.5px", color: "#7A8499" }}>{t.category}{t.is_emergency_capable ? " · 24/7" : ""}</p>
                  </div>
                  {t.contact_phone && <span style={{ fontSize: "11.5px", color: "#7A8499" }}>{t.contact_phone}</span>}
                </div>
              ))}
            </div>

            <form onSubmit={handleAddTrade} style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "8px", borderTop: "1px solid #EDE8E1" }}>
              <div style={{ display: "flex", gap: "10px" }}>
                <input value={tradeName} onChange={(e) => setTradeName(e.target.value)} placeholder="Trade name *" required style={{ flex: 1, padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1" }} />
                <select value={tradeCategory} onChange={(e) => setTradeCategory(e.target.value)} style={{ flex: 1, padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1" }}>
                  <option value="Plumbing">Plumbing</option>
                  <option value="Electrical">Electrical</option>
                  <option value="Heating/Boiler">Heating/Boiler</option>
                  <option value="general">General</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <input value={tradeEmail} onChange={(e) => setTradeEmail(e.target.value)} type="email" placeholder="Contact email" style={{ flex: 1, padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1" }} />
                <input value={tradePhone} onChange={(e) => setTradePhone(e.target.value)} placeholder="Contact phone" style={{ flex: 1, padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1" }} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "var(--navy)" }}>
                <input type="checkbox" checked={tradeEmergency} onChange={(e) => setTradeEmergency(e.target.checked)} />
                24/7 — may take an emergency straight away
              </label>
              {tradeError && <p style={{ color: "var(--brick)", margin: 0, fontSize: "12.5px" }}>{tradeError}</p>}
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowTrades(false)} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "transparent", cursor: "pointer", color: "#7A8499", fontWeight: 600 }}>Close</button>
                <button type="submit" disabled={busy || !tradeName} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "var(--navy)", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                  {busy ? "Saving…" : "Add trade"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
