"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { formatShortDate } from "../../../lib/format";

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

    const res = await fetch("/api/maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_number: roomNumber,
        issue_type: issueType,
        description: desc,
        assigned_to: assignedTo || null,
      })
    });

    if (res.ok && photoFile) {
      const ticket = await res.json();
      const body = new FormData();
      body.append("file", photoFile);
      await fetch(`/api/maintenance/${ticket.id}/photo`, { method: "POST", body });
    }

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
        setBoardError(b?.error ?? "That change didn't save. Nothing was updated. Try again.");
        return;
      }
    } catch {
      setBoardError("Could not reach the server. Nothing was updated. Try again.");
      return;
    } finally {
      setBusy(false);
    }
    void load();
  }

  if (loading) return <div style={{ padding: "1.75rem" }}><p className="muted">Reading the repair board…</p></div>;

  const now = Date.now();
  const dayMs = 86400000;
  const emergencies = tickets.filter((t) => t.severity === "emergency" && t.status !== "Resolved").length;
  const sevenDaysAgo = now - 7 * dayMs;
  const resolvedThisWeek = tickets.filter((t) => t.status === "Resolved" && (t.resolved_at ? new Date(t.resolved_at).getTime() : new Date(t.updated_at ?? t.created_at).getTime()) >= sevenDaysAgo).length;
  const openAges = tickets.filter((t) => t.status === "Open").map((t) => Math.round((now - new Date(t.created_at).getTime()) / dayMs));
  const avgOpenDays = openAges.length ? Math.round(openAges.reduce((s, n) => s + n, 0) / openAges.length) : 0;
  const COLS: Array<{ key: "Open" | "Assigned" | "Resolved"; label: string; sub: string; tone: string }> = [
    { key: "Open",     label: "Open",     sub: "nobody's picked them up yet", tone: "var(--brick)" },
    { key: "Assigned", label: "Assigned", sub: "someone's on it",             tone: "var(--amber-deep)" },
    { key: "Resolved", label: "Resolved", sub: "done · kept for the record",  tone: "var(--live)" },
  ];
  const elapsed = (iso: string) => {
    const h = (now - new Date(iso).getTime()) / 3600000;
    if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
    if (h < 24) return `${Math.round(h)}h ago`;
    const d = Math.round(h / 24); return d === 1 ? "yesterday" : `${d}d ago`;
  };

  return (
    <div style={{ padding: "1.75rem", maxWidth: 1400 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ color: "var(--navy)", fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-.3px" }}>Repairs</h1>
          <p className="sub" style={{ margin: "4px 0 0" }}>Three columns, left to right · reported → assigned → done. Click a column number to filter.</p>
        </div>
        <div className="btns">
          <button type="button" className="btn ghost" onClick={() => setShowTrades(true)}>Trades</button>
          <button type="button" className="rel" onClick={() => setShowModal(true)}>+ New ticket</button>
        </div>
      </div>

      <div className="rep-kpis">
        <div className={emergencies ? "k attn" : "k"}>
          <small>Emergency, not yet resolved</small>
          <b>{emergencies}</b>
          <span>{emergencies === 0 ? "nothing on fire" : emergencies === 1 ? "needs someone now" : "need someone now"}</span>
        </div>
        <div className="k">
          <small>Open right now</small>
          <b>{tickets.filter((t) => t.status === "Open").length}</b>
          <span>{avgOpenDays > 0 ? `avg ${avgOpenDays}d old` : "none waiting"}</span>
        </div>
        <div className="k">
          <small>In flight</small>
          <b>{tickets.filter((t) => t.status === "Assigned").length}</b>
          <span>{tickets.filter((t) => t.status === "Assigned").length === 0 ? "nothing in progress" : "with a trade or a person"}</span>
        </div>
        <div className="k">
          <small>Resolved · last 7 days</small>
          <b>{resolvedThisWeek}</b>
          <span>{resolvedThisWeek === 0 ? "nothing closed this week" : "closed since last Monday"}</span>
        </div>
      </div>

      {boardError && (
        <p className="form-error" style={{ margin: "0 0 14px" }}>{boardError}</p>
      )}

      <div className="rep-cols">
        {COLS.map((col) => {
          const rows = tickets.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className="rep-col">
              <div className="rep-col-hd">
                <span className="rep-col-dot" style={{ background: col.tone }} />
                <h3>{col.label}</h3>
                <span className="rep-col-n">{rows.length}</span>
                <small>{col.sub}</small>
              </div>
              <div className="rep-col-body">
                {rows.length === 0 ? (
                  <div className="rep-empty">
                    <b>{col.key === "Open" ? "Nothing waiting ✓" : col.key === "Assigned" ? "Nothing in flight" : "Nothing closed yet"}</b>
                    <p>{col.key === "Open" ? "Reports land here first — from staff, or straight from a wall QR." : col.key === "Assigned" ? "Pick an Open ticket and give it to someone; it moves here." : "Mark anything Assigned as resolved and it lands here with the date."}</p>
                  </div>
                ) : rows.map((ticket) => {
                  const sev = SEVERITY_STYLE[ticket.severity];
                  const assignee = profiles.find((p) => p.id === ticket.assigned_to);
                  return (
                    <article key={ticket.id} className={`rep-card${ticket.severity === "emergency" ? " emg" : ""}`}>
                      <header>
                        <span className="cat">{ticket.category || ticket.issue_type}</span>
                        <span className="ago" title={formatShortDate(ticket.created_at)}>{elapsed(ticket.created_at)}</span>
                      </header>
                      {sev && <span className="sev" style={{ background: sev.bg, color: sev.color }}>{sev.label}</span>}
                      <p className="desc">{ticket.description}</p>
                      {ticket.triage_reasoning && <p className="reason">{ticket.triage_reasoning}</p>}
                      <p className="where">
                        <span>Room <b>{ticket.room_number}</b></span>
                        {ticket.tenant?.full_name && <span> · {ticket.tenant.full_name}</span>}
                        {ticket.reported_via === "qr" && <span className="via">via wall QR</span>}
                      </p>
                      {ticket.photo_url && (
                        <div className="shot">
                          <Image src={ticket.photo_url} alt="Issue photo" fill style={{ objectFit: "cover" }} unoptimized />
                        </div>
                      )}
                      <footer>
                        <label className="asg">
                          <span className="lbl">Give to</span>
                          <select
                            value={ticket.assigned_to || ""}
                            onChange={(e) => updateTicket(ticket.id, { assigned_to: e.target.value || null, status: e.target.value ? "Assigned" : "Open" })}
                            disabled={busy || ticket.status === "Resolved"}
                          >
                            <option value="">Unassigned</option>
                            {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                          </select>
                        </label>
                        {assignee && <p className="who">{assignee.full_name} is on it</p>}
                        <div className="acts">
                          {ticket.status !== "Resolved" && (
                            <button type="button" className="rel sm" onClick={() => updateTicket(ticket.id, { status: "Resolved" })} disabled={busy}>Mark resolved ✓</button>
                          )}
                          {ticket.status === "Resolved" && (
                            <button type="button" className="btn ghost sm" onClick={() => updateTicket(ticket.id, { status: ticket.assigned_to ? "Assigned" : "Open" })} disabled={busy}>Reopen</button>
                          )}
                        </div>
                      </footer>
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })}
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
              <input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0] || null)} style={{ fontSize: "12px" }} />
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
              {trades.length === 0 && <p style={{ fontSize: "12px", color: "#7A8499", fontStyle: "italic" }}>No trades yet. Add the first one below.</p>}
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
                24/7, may take an emergency straight away
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
