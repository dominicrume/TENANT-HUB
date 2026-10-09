/**
 * HandoverPanel — today's shift handover and the incident log, on the People page.
 * A handover is about the house, not one person, so it sits where staff look at
 * the people: above the list (BUILD_PLAN C05; DECISIONS D14). Today links here.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { formatShortDate } from "../lib/format";
import { useTenants } from "../hooks/useTenants";
import { AiAssist } from "./AiAssist";

interface Handover { id: string; shift_type: string; notes: string; staff_name: string; created_at: string }
interface Incident { id: string; incident_type: string; description: string; reported_by: string; incident_date: string; tenant?: { full_name?: string } | null }

export function HandoverPanel() {
  const today = new Date().toISOString().slice(0, 10);
  const { activeTenants } = useTenants();
  const [handovers, setHandovers] = useState<Handover[] | null>(null);
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [writing, setWriting] = useState(false);
  const [shift, setShift] = useState(() => { const h = new Date().getHours(); return h < 14 ? "Morning" : h < 22 ? "Evening" : "Night"; });
  const [notes, setNotes] = useState("");
  const [logging, setLogging] = useState(false);
  const [iType, setIType] = useState("ASB");
  const [iTenant, setITenant] = useState("");
  const [iDesc, setIDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [h, i] = await Promise.all([fetch(`/api/handovers?date=${today}`), fetch("/api/incidents")]);
    if (h.ok) setHandovers((await h.json()) as Handover[]); else setHandovers((p) => p ?? []);
    if (i.ok) setIncidents(((await i.json()) as Incident[]).slice(0, 5)); else setIncidents((p) => p ?? []);
  }, [today]);
  useEffect(() => { void load(); }, [load]);

  async function saveHandover(e: React.FormEvent) {
    e.preventDefault(); if (!notes.trim()) return; setBusy(true);
    const res = await fetch("/api/handovers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shift_date: today, shift_type: shift, notes }) });
    setBusy(false); if (res.ok) { setNotes(""); setWriting(false); void load(); }
  }
  async function saveIncident(e: React.FormEvent) {
    e.preventDefault(); if (!iDesc.trim()) return; setBusy(true);
    const res = await fetch("/api/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant_id: iTenant || null, incident_type: iType, description: iDesc, incident_date: new Date().toISOString() }) });
    setBusy(false); if (res.ok) { setIDesc(""); setITenant(""); setLogging(false); void load(); }
  }

  const none = handovers !== null && handovers.length === 0;

  return (
    <section id="handover" className="card" style={{ marginBottom: 18 }}>
      <div className="ch"><h3>Today&apos;s handover</h3>
        <div className="btns">
          <button type="button" className="btn ghost sm" onClick={() => setLogging((v) => !v)}>{logging ? "Cancel" : "Log an incident"}</button>
          <button type="button" className={none ? "rel sm" : "btn sm"} onClick={() => setWriting((v) => !v)}>{writing ? "Cancel" : none ? "Write today's handover" : "Add to it"}</button>
        </div>
      </div>

      {writing && (
        <form onSubmit={saveHandover} className="li" style={{ display: "grid", gap: 10 }}>
          <label><span className="lbl">Shift</span>
            <select value={shift} onChange={(e) => setShift(e.target.value)} style={inp}><option>Morning</option><option>Evening</option><option>Night</option></select></label>
          <label><span className="lbl">For the next shift</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} required placeholder="Who to watch, what's outstanding, what's changed. Three lines is enough." style={{ ...inp, minHeight: 90, resize: "vertical" }} /></label>
          <AiAssist purpose="handover" value={notes} onChange={setNotes} context={{ shift }} />
          <div><button type="submit" className="rel" disabled={busy || !notes.trim()}>{busy ? "Saving…" : "Post handover"}</button></div>
        </form>
      )}

      {logging && (
        <form onSubmit={saveIncident} className="li" style={{ display: "grid", gap: 10, background: "rgba(178,74,49,.04)" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ flex: 1, minWidth: 160 }}><span className="lbl">What kind</span>
              <select value={iType} onChange={(e) => setIType(e.target.value)} style={inp}>
                <option value="ASB">Anti-social behaviour</option><option value="Medical">Medical</option><option value="Police">Police attended</option><option value="Safeguarding">Safeguarding</option><option value="Other">Other</option></select></label>
            <label style={{ flex: 1, minWidth: 160 }}><span className="lbl">Who</span>
              <select value={iTenant} onChange={(e) => setITenant(e.target.value)} style={inp}><option value="">Nobody in particular</option>
                {activeTenants.map((t) => <option key={t.id} value={t.id}>{t.full_name}{t.room_number ? ` (${t.room_number})` : ""}</option>)}</select></label>
          </div>
          <label><span className="lbl">What happened</span>
            <textarea value={iDesc} onChange={(e) => setIDesc(e.target.value)} required placeholder="Just the facts, in order." style={{ ...inp, minHeight: 90, resize: "vertical" }} /></label>
          <AiAssist purpose="incident" value={iDesc} onChange={setIDesc} context={{ incidentType: iType }} />
          <div><button type="submit" className="rel" disabled={busy || !iDesc.trim()}>{busy ? "Saving…" : "Log incident"}</button></div>
        </form>
      )}

      {handovers === null ? <div className="li"><p className="muted">Loading…</p></div>
        : none ? <div className="li"><div className="body"><b>Nothing written for today yet</b><p>The next shift will read whatever you leave here.</p></div></div>
        : handovers.map((h) => (
          <div className="li" key={h.id}>
            <span className="tag sup" style={{ marginTop: 3 }}>{h.shift_type.toUpperCase()}</span>
            <div className="body"><b>{h.staff_name}</b><p style={{ whiteSpace: "pre-wrap" }}>{h.notes}</p></div>
          </div>))}

      {incidents && incidents.length > 0 && (
        <details className="li" style={{ display: "block" }}>
          <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: "var(--brick)", minHeight: 36, display: "flex", alignItems: "center" }}>Recent incidents ({incidents.length})</summary>
          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
            {incidents.map((i) => (
              <div key={i.id} style={{ borderLeft: "3px solid var(--brick)", paddingLeft: 10 }}>
                <b style={{ fontSize: 13 }}>{i.incident_type}</b> <span className="muted">· {formatShortDate(i.incident_date)}{i.tenant?.full_name ? ` · ${i.tenant.full_name}` : ""} · {i.reported_by}</span>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--slate)", whiteSpace: "pre-wrap" }}>{i.description}</p>
              </div>))}
          </div>
        </details>
      )}
    </section>
  );
}

const inp: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
