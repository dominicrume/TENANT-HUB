"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { formatShortDate } from "../../../lib/format";
import { getSupabaseBrowser } from "../../../lib/supabase-browser";

export default function MaintenancePage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  
  // New ticket state
  const [issueType, setIssueType] = useState("Plumbing");
  const [roomNumber, setRoomNumber] = useState("");
  const [desc, setDesc] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [assignedTo, setAssignedTo] = useState("");

  const supabase = getSupabaseBrowser();

  const load = useCallback(async () => {
    setLoading(true);
    const [tRes, pRes] = await Promise.all([
      fetch("/api/maintenance"),
      fetch("/api/profiles")
    ]);
    if (tRes.ok) setTickets(await tRes.json());
    if (pRes.ok) setProfiles(await pRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!desc || !roomNumber) return;
    setBusy(true);

    let photo_url = null;
    if (photoFile) {
      const ext = photoFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;
      const { data, error } = await supabase.storage.from("maintenance-photos").upload(fileName, photoFile);
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
    await fetch(`/api/maintenance/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates)
    });
    setBusy(false);
    void load();
  }

  if (loading) return <div style={{ padding: "1.75rem" }}>Loading maintenance board...</div>;

  return (
    <div style={{ padding: "1.75rem", fontFamily: "'Sora', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ color: "var(--navy)", fontSize: "22px", fontWeight: 700, margin: 0 }}>
          Maintenance & Repairs
        </h1>
        <button onClick={() => setShowModal(true)} style={{ padding: "10px 20px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
          + New Ticket
        </button>
      </div>
      
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
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--amber)", textTransform: "uppercase" }}>{ticket.issue_type}</span>
                    <span style={{ fontSize: "11px", color: "#7A8499" }}>{formatShortDate(ticket.created_at)}</span>
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--navy)", fontWeight: 600, margin: "0 0 6px 0" }}>{ticket.description}</p>
                  <p style={{ fontSize: "12px", color: "#7A8499", margin: "0 0 10px 0" }}>
                    Room: <strong>{ticket.room_number}</strong>
                    {ticket.tenant?.full_name ? ` · ${ticket.tenant.full_name}` : ""}
                  </p>
                  
                  {ticket.photo_url && (
                    <div style={{ marginBottom: "10px" }}>
                      <img 
                        src={supabase.storage.from("maintenance-photos").getPublicUrl(ticket.photo_url).data.publicUrl} 
                        alt="Issue" 
                        style={{ width: "100%", height: "120px", objectFit: "cover", borderRadius: "6px" }}
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
    </div>
  );
}
