/**
 * Leads — people who might become tenants, on the timeline Matloob drew
 * (2026-10-14): lead received → referenced → viewing → offer → moved in.
 * One board, one card per person; every next step is a button on the card.
 * "Start intake" opens the real five-step intake with their details filled.
 */
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LEAD_STAGES, LEAD_SOURCES, type Lead } from "../../../lib/leads";
import { formatDateTime, formatShortDate } from "../../../lib/format";

interface PropertyOpt { id: string; name: string; landlordName: string | null; units?: Array<{ id: string; reference: string; status: string }> }

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [properties, setProperties] = useState<PropertyOpt[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState(""); const [source, setSource] = useState("council"); const [notes, setNotes] = useState(""); const [propertyId, setPropertyId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLost, setShowLost] = useState(false);
  const [viewingFor, setViewingFor] = useState<string | null>(null);
  const [viewingAt, setViewingAt] = useState("");

  const load = useCallback(async () => {
    try { const r = await fetch("/api/leads"); if (r.ok) { const j = await r.json(); setLeads(j.leads); setCounts(j.counts); } } catch { /* keep */ }
  }, []);
  useEffect(() => { void load(); fetch("/api/properties").then((r) => (r.ok ? r.json() : [])).then((d) => setProperties(Array.isArray(d) ? d : [])).catch(() => {}); }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy("add"); setError(null);
    try {
      const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ full_name: name, phone, email, source, notes, property_id: propertyId || null }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "Could not add"); return; }
      setName(""); setPhone(""); setEmail(""); setNotes(""); setPropertyId(""); setAdding(false);
      await load();
    } catch { setError("Could not reach the server."); } finally { setBusy(null); }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id); setError(null);
    try {
      const r = await fetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "Could not update"); return null; }
      await load();
      return b;
    } catch { setError("Could not reach the server."); return null; }
    finally { setBusy(null); }
  }

  async function convert(l: Lead) {
    const b = await patch(l.id, { action: "convert" });
    if (b?.draftId) router.push(`/intake/${b.draftId}/review`);
  }

  const visible = (leads ?? []).filter((l) => showLost ? l.stage === "lost" : l.stage !== "lost");
  const stageIndex = (s: string) => LEAD_STAGES.findIndex((x) => x.key === s);

  return (
    <div style={{ padding: "1.75rem", maxWidth: 1040 }}>
      <div className="ch" style={{ padding: 0, marginBottom: 6, border: "none", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ margin: 0 }}>Leads</h1>
        <div className="btns">
          <button type="button" className="btn ghost sm" onClick={() => setShowLost((v) => !v)}>{showLost ? "Back to live leads" : `Lost (${counts["lost"] ?? 0})`}</button>
          <button type="button" className="rel" onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "+ New lead"}</button>
        </div>
      </div>
      <p className="sub">Everyone asking for a room, and where each one is on the way to moving in.</p>

      {/* The timeline — counts per stage; click a stage to jump to those cards. */}
      <div className="timeline" style={{ marginBottom: 18 }}>
        {LEAD_STAGES.map((s, i) => (
          <a key={s.key} href={`#stage-${s.key}`} className="tl-step">
            <span className="tl-n">{counts[s.key] ?? 0}</span>
            <b>{s.label}</b>
            <small>{s.hint}</small>
            {i < LEAD_STAGES.length - 1 && <span className="tl-arrow" aria-hidden="true">›</span>}
          </a>
        ))}
      </div>

      {adding && (
        <form onSubmit={add} className="card" style={{ marginBottom: 18, padding: 18, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <label><span className="lbl">Full name</span><input value={name} onChange={(e) => setName(e.target.value)} required style={inp} /></label>
          <label><span className="lbl">Phone</span><input value={phone} onChange={(e) => setPhone(e.target.value)} style={inp} /></label>
          <label><span className="lbl">Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inp} /></label>
          <label><span className="lbl">Came from</span><select value={source} onChange={(e) => setSource(e.target.value)} style={inp}>{LEAD_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
          <label><span className="lbl">Interested in</span><select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} style={inp}><option value="">Any property</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label style={{ gridColumn: "1 / -1" }}><span className="lbl">Notes</span><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Needs ground floor · referred by Sarah at the council · moving date…" style={inp} /></label>
          {error && <p style={{ color: "var(--brick)", margin: 0, fontSize: 13, gridColumn: "1 / -1" }}>{error}</p>}
          <div style={{ gridColumn: "1 / -1" }}><button type="submit" className="rel" disabled={busy === "add" || !name.trim()}>{busy === "add" ? "Adding…" : "Add lead"}</button></div>
        </form>
      )}
      {error && !adding && <p style={{ color: "var(--brick)", fontSize: 13 }}>{error}</p>}

      {leads === null ? <section className="card"><div className="li"><p className="muted">Loading…</p></div></section>
        : visible.length === 0 ? (
          <section className="card"><div className="li"><div className="body"><b>{showLost ? "No lost leads" : "No leads yet"}</b><p>{showLost ? "Good." : "When the council, a charity or a person asks about a room, add them here — then every step to moving in is one button."}</p></div></div></section>
        ) : LEAD_STAGES.filter((s) => showLost ? false : true).map((s) => {
          const rows = visible.filter((l) => l.stage === s.key);
          if (rows.length === 0 && !showLost) return null;
          return (
            <section className="card" key={s.key} id={`stage-${s.key}`} style={{ marginBottom: 18 }}>
              <div className="ch"><h3>{s.label} <span className="muted" style={{ fontWeight: 500 }}>· {rows.length}</span></h3></div>
              {rows.map((l) => <LeadCard key={l.id} l={l} busy={busy === l.id} stageIdx={stageIndex(l.stage)} properties={properties}
                onStage={(stage) => void patch(l.id, { stage })}
                onLost={() => { const why = window.prompt("Why was this lead lost? (one line)") ?? ""; void patch(l.id, { stage: "lost", lost_reason: why }); }}
                onProperty={(property_id, unit_id) => void patch(l.id, { property_id, unit_id })}
                onViewing={() => { setViewingFor(l.id); setViewingAt(l.viewing_at ? l.viewing_at.slice(0, 16) : ""); }}
                onConvert={() => void convert(l)} />)}
            </section>
          );
        })}
      {showLost && visible.length > 0 && (
        <section className="card"><div className="ch"><h3>Lost</h3></div>{visible.map((l) => (
          <div className="li" key={l.id}><div className="body"><b>{l.full_name}</b><p>{l.lost_reason ?? "No reason given"} · {formatShortDate(l.updated_at)}</p></div>
            <button type="button" className="btn ghost sm" disabled={busy === l.id} onClick={() => void patch(l.id, { stage: "received" })}>Reopen</button></div>))}</section>
      )}

      {viewingFor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,28,46,.5)", display: "grid", placeItems: "center", zIndex: 1000, padding: 16 }} onClick={() => setViewingFor(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={async (e) => { e.preventDefault(); const ok = await patch(viewingFor, { viewing_at: new Date(viewingAt).toISOString() }); if (ok) setViewingFor(null); }}
            style={{ background: "#fff", borderRadius: 14, padding: 20, width: "100%", maxWidth: 380, display: "grid", gap: 10 }}>
            <h3 style={{ margin: 0 }}>Book the viewing</h3>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>It goes straight into the diary.</p>
            <input type="datetime-local" value={viewingAt} onChange={(e) => setViewingAt(e.target.value)} required style={inp} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button type="button" className="btn ghost sm" onClick={() => setViewingFor(null)}>Cancel</button><button type="submit" className="rel sm" disabled={!viewingAt}>Book</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

function LeadCard({ l, busy, stageIdx, properties, onStage, onLost, onProperty, onViewing, onConvert }: {
  l: Lead; busy: boolean; stageIdx: number; properties: PropertyOpt[];
  onStage: (s: string) => void; onLost: () => void; onProperty: (p: string | null, u: string | null) => void; onViewing: () => void; onConvert: () => void;
}) {
  const next = LEAD_STAGES[stageIdx + 1];
  const src = LEAD_SOURCES.find((s) => s.key === l.source)?.label ?? l.source;
  return (
    <div className="li" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
      <span className="avatar" aria-hidden="true" style={{ background: "var(--navy)", color: "#fff" }}>{l.full_name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
      <div className="body" style={{ minWidth: 220 }}>
        <b>{l.full_name}{l.tenant_id && <Link href={`/tenants/${l.tenant_id}`} className="tag" style={{ marginLeft: 8, background: "rgba(30,127,79,.12)", color: "#1E7F4F", textDecoration: "none" }}>open tenant record</Link>}</b>
        <p>{[l.phone, l.email].filter(Boolean).join(" · ") || "No contact details"} · {src} · added {formatShortDate(l.created_at)} by {l.created_by}</p>
        {l.viewing_at && <p style={{ color: "var(--amber-deep)", fontWeight: 600 }}>Viewing {formatDateTime(l.viewing_at)}{l.property_name ? ` · ${l.property_name}` : ""}</p>}
        {l.notes && <p style={{ fontStyle: "italic" }}>{l.notes}</p>}
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
          <select value={l.property_id ?? ""} onChange={(e) => onProperty(e.target.value || null, null)} disabled={busy} aria-label="Property" style={{ ...inp, maxWidth: 220, minHeight: 34, padding: "4px 8px", fontSize: 12.5 }}>
            <option value="">Any property</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}{p.landlordName ? ` · ${p.landlordName}` : ""}</option>)}
          </select>
        </div>
      </div>
      {l.stage !== "moved_in" && (
        <div className="btns" style={{ alignSelf: "center" }}>
          {(l.stage === "received" || l.stage === "referenced" || l.stage === "viewing") && <button type="button" className="btn ghost sm" disabled={busy} onClick={onViewing}>{l.viewing_at ? "Rebook viewing" : "Book viewing"}</button>}
          {next && next.key !== "moved_in" && next.key !== "viewing" && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => onStage(next.key)}>→ {next.label}</button>}
          {next && next.key === "viewing" && !l.viewing_at && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => onStage("viewing")}>→ Viewing done</button>}
          <button type="button" className="rel sm" disabled={busy} onClick={onConvert} title="Opens the full intake with their details filled in">Start intake →</button>
          <button type="button" className="btn ghost sm" disabled={busy} onClick={onLost} style={{ color: "var(--brick)" }}>Lost</button>
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
