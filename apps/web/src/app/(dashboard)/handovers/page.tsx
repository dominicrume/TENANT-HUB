"use client";

import { useState, useEffect, useCallback } from "react";
import { formatShortDate } from "../../../lib/format";
import { useTenants } from "../../../hooks/useTenants";

export default function HandoversPage() {
  const [handovers, setHandovers] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const { activeTenants } = useTenants();

  // Handover form state
  const [hShift, setHShift] = useState("Morning");
  const [hNotes, setHNotes] = useState("");
  const [hSaving, setHSaving] = useState(false);

  // Incident form state
  const [iTenant, setITenant] = useState("");
  const [iType, setIType] = useState("ASB");
  const [iDesc, setIDesc] = useState("");
  const [iSaving, setISaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [hRes, iRes] = await Promise.all([
      fetch(`/api/handovers?date=${date}`),
      fetch(`/api/incidents`) // fetch all recent incidents
    ]);
    if (hRes.ok) setHandovers(await hRes.json());
    if (iRes.ok) setIncidents(await iRes.json());
    setLoading(false);
  }, [date]);

  useEffect(() => { void load(); }, [load]);

  async function saveHandover() {
    if (!hNotes) return;
    setHSaving(true);
    await fetch("/api/handovers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shift_date: date, shift_type: hShift, notes: hNotes })
    });
    setHSaving(false);
    setHNotes("");
    void load();
  }

  async function saveIncident() {
    if (!iDesc) return;
    setISaving(true);
    await fetch("/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: iTenant || null, incident_type: iType, description: iDesc, incident_date: new Date().toISOString() })
    });
    setISaving(false);
    setIDesc("");
    setITenant("");
    void load();
  }

  return (
    <div style={{ padding: "1.75rem", fontFamily: "'Sora', sans-serif" }}>
      <h1 style={{ color: "var(--navy)", fontSize: "22px", fontWeight: 700, marginBottom: "20px" }}>
        Daily Shift Log & Incidents
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        
        {/* SHIFT HANDOVERS */}
        <div>
          <div style={{ background: "#F8F4EF", padding: "20px", borderRadius: "12px", marginBottom: "20px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--navy)", marginBottom: "16px" }}>Shift Handover</h3>
            <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: "8px", borderRadius: "6px", border: "1px solid #D9D2C7" }} />
              <select value={hShift} onChange={e => setHShift(e.target.value)} style={{ padding: "8px", borderRadius: "6px", border: "1px solid #D9D2C7" }}>
                <option value="Morning">Morning Shift</option>
                <option value="Evening">Evening Shift</option>
                <option value="Night">Night Shift</option>
              </select>
            </div>
            <textarea
              value={hNotes}
              onChange={e => setHNotes(e.target.value)}
              placeholder="Important notes for the next shift..."
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #D9D2C7", fontSize: "13px", minHeight: "80px", marginBottom: "12px", boxSizing: "border-box" }}
            />
            <button onClick={saveHandover} disabled={hSaving || !hNotes} style={{ padding: "10px 20px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: hSaving || !hNotes ? "not-allowed" : "pointer" }}>
              {hSaving ? "Saving..." : "Post Handover"}
            </button>
          </div>

          <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--navy)", marginBottom: "12px" }}>Handovers for {date}</h3>
          {loading ? <p>Loading...</p> : handovers.length === 0 ? <p style={{ fontSize: "13px", color: "#7A8499" }}>No handovers recorded yet for this date.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {handovers.map(h => (
                <div key={h.id} style={{ background: "#fff", padding: "16px", borderRadius: "8px", border: "1px solid #EDE8E1" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--amber)", textTransform: "uppercase" }}>{h.shift_type} SHIFT</span>
                    <span style={{ fontSize: "11px", color: "#7A8499" }}>{h.staff_name}</span>
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--navy)", margin: 0, whiteSpace: "pre-wrap" }}>{h.notes}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* INCIDENT LOG */}
        <div>
          <div style={{ background: "rgba(224, 82, 82, 0.05)", padding: "20px", borderRadius: "12px", marginBottom: "20px", border: "1px solid rgba(224, 82, 82, 0.2)" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#E05252", marginBottom: "16px" }}>Report Critical Incident</h3>
            <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
              <select value={iType} onChange={e => setIType(e.target.value)} style={{ padding: "8px", borderRadius: "6px", border: "1px solid #D9D2C7" }}>
                <option value="ASB">Anti-Social Behaviour (ASB)</option>
                <option value="Medical">Medical Emergency</option>
                <option value="Police">Police Attendance</option>
                <option value="Safeguarding">Safeguarding Concern</option>
                <option value="Other">Other</option>
              </select>
              <select value={iTenant} onChange={e => setITenant(e.target.value)} style={{ padding: "8px", borderRadius: "6px", border: "1px solid #D9D2C7", flex: 1 }}>
                <option value="">General/Unknown Tenant</option>
                {activeTenants.map(t => <option key={t.id} value={t.id}>{t.full_name} ({t.room_number})</option>)}
              </select>
            </div>
            <textarea
              value={iDesc}
              onChange={e => setIDesc(e.target.value)}
              placeholder="Provide a factual, objective description of the incident..."
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #D9D2C7", fontSize: "13px", minHeight: "80px", marginBottom: "12px", boxSizing: "border-box" }}
            />
            <button onClick={saveIncident} disabled={iSaving || !iDesc} style={{ padding: "10px 20px", borderRadius: "8px", border: "none", background: "#E05252", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: iSaving || !iDesc ? "not-allowed" : "pointer" }}>
              {iSaving ? "Submitting..." : "Log Incident"}
            </button>
          </div>

          <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--navy)", marginBottom: "12px" }}>Recent Incidents</h3>
          {loading ? <p>Loading...</p> : incidents.length === 0 ? <p style={{ fontSize: "13px", color: "#7A8499" }}>No recent incidents.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {incidents.slice(0, 10).map(i => (
                <div key={i.id} style={{ background: "#fff", padding: "16px", borderRadius: "8px", border: "1px solid #EDE8E1", borderLeft: "4px solid #E05252" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#E05252", textTransform: "uppercase" }}>{i.incident_type}</span>
                    <span style={{ fontSize: "11px", color: "#7A8499" }}>{formatShortDate(i.incident_date)}</span>
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--navy)", margin: "0 0 6px 0", whiteSpace: "pre-wrap" }}>{i.description}</p>
                  <div style={{ fontSize: "11px", color: "#7A8499", display: "flex", justifyContent: "space-between" }}>
                    <span>{i.tenant?.full_name ? `Involving: ${i.tenant.full_name}` : "General"}</span>
                    <span>Reported by: {i.reported_by}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
