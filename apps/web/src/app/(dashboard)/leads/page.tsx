/**
 * Leads — people who might become tenants, on the road Matloob drew:
 * received → viewing → referenced → signing up → moved in. One card per
 * person, the road drawn on the card, and the next thing to do is the one
 * amber button. Booking a viewing names who does it and which room, and it
 * lands in that person's diary; referencing is a real panel — ID seen, proof
 * of benefit seen, several references each asked for and answered;
 * "Sign up" opens the intake with their details filled.
 */
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { LEAD_STAGES, LEAD_SOURCES, REFERENCE_KINDS, REFERENCE_METHODS, REFERENCE_OUTCOMES, referencingReady, type Lead } from "../../../lib/leads";
import { formatDateTime, formatShortDate } from "../../../lib/format";
import { useAuth } from "../../../contexts/AuthContext";
import { DateTimeField } from "../../../components/form/DateTimeField";

interface PropertyOpt { id: string; name: string; postcode?: string | null; landlordName: string | null; units?: Array<{ id: string; reference: string; status: string }> }
interface Staff { id: string; full_name: string }

export default function LeadsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [properties, setProperties] = useState<PropertyOpt[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState(""); const [source, setSource] = useState("self_referred"); const [notes, setNotes] = useState(""); const [propertyId, setPropertyId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLost, setShowLost] = useState(false);
  const [booking, setBooking] = useState<Lead | null>(null);
  const [refOpen, setRefOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await fetch("/api/leads"); if (r.ok) { const j = await r.json(); setLeads(j.leads); setCounts(j.counts); } } catch { /* keep */ }
  }, []);
  useEffect(() => {
    void load();
    fetch("/api/properties").then((r) => (r.ok ? r.json() : [])).then((d) => setProperties(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/profiles").then((r) => (r.ok ? r.json() : [])).then((d) => setStaff(Array.isArray(d) ? d : [])).catch(() => {});
  }, [load]);

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

  async function patch(id: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(id); setError(null);
    try {
      const r = await fetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "Could not update"); return null; }
      await load();
      return b ?? {};
    } catch { setError("Could not reach the server."); return null; }
    finally { setBusy(null); }
  }

  async function convert(l: Lead) {
    if (l.draft_id) { router.push(`/intake/${l.draft_id}/review`); return; }
    const b = await patch(l.id, { action: "convert" });
    if (b && typeof b["draftId"] === "string") router.push(`/intake/${b["draftId"]}/review`);
  }

  const visible = (leads ?? []).filter((l) => showLost ? l.stage === "lost" : l.stage !== "lost");

  return (
    <div style={{ padding: "1.75rem", maxWidth: 1040 }}>
      <div className="ch" style={{ padding: 0, marginBottom: 6, border: "none", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ margin: 0 }}>Leads</h1>
        <div className="btns">
          <button type="button" className="btn ghost sm" onClick={() => setShowLost((v) => !v)}>{showLost ? "Back to live leads" : `Lost (${counts["lost"] ?? 0})`}</button>
          <button type="button" className="rel" onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "+ New lead"}</button>
        </div>
      </div>
      <p className="sub">Everyone asking for a room, and where each one is on the way to moving in. The amber button is always the next thing to do.</p>

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
          <label><span className="lbl">How they came to us</span><select value={source} onChange={(e) => setSource(e.target.value)} style={inp}>{LEAD_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
          <label><span className="lbl">Interested in</span><select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} style={inp}><option value="">Any property</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}{p.landlordName ? ` · ${p.landlordName}` : ""}</option>)}</select></label>
          <label style={{ gridColumn: "1 / -1" }}><span className="lbl">Notes</span><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Needs ground floor · referred by Sarah at the council · moving date…" style={inp} /></label>
          {error && <p style={{ color: "var(--brick)", margin: 0, fontSize: 13, gridColumn: "1 / -1" }}>{error}</p>}
          <div style={{ gridColumn: "1 / -1" }}><button type="submit" className="rel" disabled={busy === "add" || !name.trim()}>{busy === "add" ? "Adding…" : "Add lead"}</button></div>
        </form>
      )}
      {error && !adding && <p style={{ color: "var(--brick)", fontSize: 13 }}>{error}</p>}

      {leads === null ? <section className="card"><div className="li"><p className="muted">Loading…</p></div></section>
        : visible.length === 0 ? (
          <section className="card"><div className="li"><div className="body"><b>{showLost ? "No lost leads" : "No leads yet"}</b><p>{showLost ? "Good." : "When the council, a charity or a person asks about a room, add them here — then every step to moving in is one button."}</p></div></div></section>
        ) : showLost ? (
          <section className="card"><div className="ch"><h3>Lost</h3></div>{visible.map((l) => (
            <div className="li" key={l.id}><div className="body"><b>{l.full_name}</b><p>{l.lost_reason ?? "No reason given"} · {formatShortDate(l.updated_at)}</p></div>
              <button type="button" className="btn ghost sm" disabled={busy === l.id} onClick={() => void patch(l.id, { stage: "received" })}>Reopen</button></div>))}</section>
        ) : LEAD_STAGES.map((s) => {
          const rows = visible.filter((l) => l.stage === s.key).sort((a, b) => (a.viewing_at ?? "9").localeCompare(b.viewing_at ?? "9"));
          if (rows.length === 0) return null;
          return (
            <section className="card" key={s.key} id={`stage-${s.key}`} style={{ marginBottom: 18 }}>
              <div className="ch"><h3>{s.label} <span className="muted" style={{ fontWeight: 500 }}>· {rows.length}</span></h3><span className="muted">{s.hint}</span></div>
              {rows.map((l) => <LeadCard key={l.id} l={l} busy={busy === l.id} properties={properties} refOpen={refOpen === l.id}
                onBook={() => setBooking(l)}
                onViewingDone={() => void patch(l.id, { action: "viewing_done" })}
                onViewingCancel={() => { if (window.confirm("Cancel this viewing?")) void patch(l.id, { action: "viewing_cancelled" }); }}
                onRefToggle={() => setRefOpen((v) => (v === l.id ? null : l.id))}
                onPatch={(b) => patch(l.id, b)}
                onLost={() => { const why = window.prompt("Why was this lead lost? (one line)") ?? ""; void patch(l.id, { stage: "lost", lost_reason: why }); }}
                onProperty={(property_id) => void patch(l.id, { property_id, unit_id: null })}
                onConvert={() => void convert(l)} />)}
            </section>
          );
        })}

      {booking && <BookViewing l={booking} staff={staff} properties={properties} me={profile?.full_name ?? ""} busy={busy === booking.id}
        onClose={() => setBooking(null)}
        onSave={async (b) => { const ok = await patch(booking.id, b); if (ok) setBooking(null); }} />}
    </div>
  );
}

/** The road on the card: five dots, green behind, amber now, grey ahead. */
function Road({ stage }: { stage: string }) {
  const idx = LEAD_STAGES.findIndex((s) => s.key === stage);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, margin: "6px 0 2px" }} aria-label={`Stage: ${LEAD_STAGES[idx]?.label ?? stage}`}>
      {LEAD_STAGES.map((s, i) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center" }} title={s.label}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: i < idx ? "var(--live)" : i === idx ? "var(--amber)" : "#D9D2C6", boxShadow: i === idx ? "0 0 0 3px rgba(232,168,76,.3)" : "none", display: "inline-block" }} />
          {i < LEAD_STAGES.length - 1 && <span style={{ width: 22, height: 2, background: i < idx ? "var(--live)" : "#D9D2C6", display: "inline-block" }} />}
        </div>
      ))}
      <span className="muted" style={{ fontSize: 11.5, marginLeft: 8 }}>{LEAD_STAGES[idx]?.label}</span>
    </div>
  );
}

function LeadCard({ l, busy, properties, refOpen, onBook, onViewingDone, onViewingCancel, onRefToggle, onPatch, onLost, onProperty, onConvert }: {
  l: Lead; busy: boolean; properties: PropertyOpt[]; refOpen: boolean;
  onBook: () => void; onViewingDone: () => void; onViewingCancel: () => void; onRefToggle: () => void; onPatch: (b: Record<string, unknown>) => Promise<unknown>; onLost: () => void; onProperty: (p: string | null) => void; onConvert: () => void;
}) {
  const src = LEAD_SOURCES.find((s) => s.key === l.source)?.label ?? l.source.replace(/_/g, " ");
  const viewingPending = !!l.viewing_at && !l.viewing_done_at;
  const viewed = !!l.viewing_done_at;
  const refs = l.references ?? [];
  const refDone = l.stage === "referenced" || l.stage === "offer";
  const ready = referencingReady(l);
  const showRefPanel = (viewed || l.stage === "referenced" || l.stage === "offer") && l.stage !== "moved_in";
  // The one amber button: the next thing to do for this person.
  const next: { label: string; go: () => void } | null =
    l.stage === "moved_in" ? null
    : !l.viewing_at ? { label: "Book viewing", go: onBook }
    : viewingPending ? { label: "Viewing done ✓", go: onViewingDone }
    : !refDone ? (ready ? { label: "Referencing complete →", go: () => void onPatch({ action: "referencing_complete" }) } : { label: refOpen ? "Referencing (open)" : "Referencing", go: onRefToggle })
    : { label: l.draft_id ? "Continue sign-up →" : "Sign up →", go: onConvert };
  const waiting = refs.filter((r) => r.outcome === "pending").length; const good = refs.filter((r) => r.outcome === "satisfactory").length;

  return (
    <div className="li" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
      <span className="avatar" aria-hidden="true" style={{ background: "var(--navy)", color: "#fff" }}>{l.full_name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
      <div className="body" style={{ minWidth: 240 }}>
        <b>{l.full_name}{l.tenant_id && <Link href={`/tenants/${l.tenant_id}`} className="tag" style={{ marginLeft: 8, background: "rgba(30,127,79,.12)", color: "#1E7F4F", textDecoration: "none" }}>now a tenant{l.tenant_room ? ` · ${l.tenant_room}` : ""} → open record</Link>}</b>
        <p>{[l.phone, l.email].filter(Boolean).join(" · ") || "No contact details"} · {src} · added {formatShortDate(l.created_at)} by {l.created_by}</p>
        <Road stage={l.stage} />
        {l.viewing_at && (
          <p style={{ color: viewed ? "var(--live)" : "var(--amber-deep)", fontWeight: 600 }}>
            {viewed ? `Viewed ${formatDateTime(l.viewing_at)}` : `Viewing ${formatDateTime(l.viewing_at)}`}{l.property_name ? ` · ${l.property_name}` : ""}{l.unit_reference ? ` · ${l.unit_reference}` : ""}{l.assigned_to ? ` · with ${l.assigned_to}` : ""}
            {viewingPending && <> · <button type="button" className="btn ghost sm" style={{ minHeight: 24, padding: "0 8px", fontSize: 12 }} disabled={busy} onClick={onBook}>Rebook</button> <button type="button" className="btn ghost sm" style={{ minHeight: 24, padding: "0 8px", fontSize: 12, color: "var(--brick)" }} disabled={busy} onClick={onViewingCancel}>Cancel</button></>}
          </p>
        )}
        {showRefPanel && (
          <p style={{ color: refDone || ready ? "var(--live)" : "var(--amber-deep)", fontWeight: 600, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span>Referencing · ID {l.id_checked_at ? "seen ✓" : "not seen"} · benefit proof {l.benefit_checked_at ? "seen ✓" : "not seen"} · {l.no_reference_needed ? "no reference needed" : `${good} satisfactory${waiting ? `, ${waiting} waiting` : ""}${refs.length === 0 ? " — none asked yet" : ""}`}</span>
            <button type="button" className="btn ghost sm" style={{ minHeight: 24, padding: "0 8px", fontSize: 12 }} onClick={onRefToggle}>{refOpen ? "Close" : "Open"}</button>
          </p>
        )}
        {refOpen && showRefPanel && <ReferencingPanel l={l} busy={busy} onPatch={onPatch} />}
        {l.notes && <p style={{ fontStyle: "italic" }}>{l.notes}</p>}
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
          <select value={l.property_id ?? ""} onChange={(e) => onProperty(e.target.value || null)} disabled={busy} aria-label="Property" style={{ ...inp, maxWidth: 260, minHeight: 34, padding: "4px 8px", fontSize: 12.5 }}>
            <option value="">Any property</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}{p.landlordName ? ` · ${p.landlordName}` : ""}</option>)}
          </select>
        </div>
      </div>
      {l.stage !== "moved_in" && (
        <div className="btns" style={{ alignSelf: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {next && <button type="button" className="rel sm" disabled={busy} onClick={next.go}>{next.label}</button>}
          {!next?.label.includes("ign") && <button type="button" className="btn ghost sm" disabled={busy} onClick={onConvert} title="Opens the full intake with their details filled in">{l.draft_id ? "Continue sign-up" : "Sign up anyway"}</button>}
          <button type="button" className="btn ghost sm" disabled={busy} onClick={onLost} style={{ color: "var(--brick)" }}>Lost</button>
        </div>
      )}
    </div>
  );
}

/** Referencing: the two checks, the references (each its own row), and "no reference needed". */
function ReferencingPanel({ l, busy, onPatch }: { l: Lead; busy: boolean; onPatch: (b: Record<string, unknown>) => Promise<unknown> }) {
  const [adding, setAdding] = useState((l.references ?? []).length === 0 && !l.no_reference_needed);
  const [kind, setKind] = useState("previous_landlord"); const [who, setWho] = useState(""); const [contact, setContact] = useState(""); const [method, setMethod] = useState("phone"); const [notes, setNotes] = useState("");
  const refs = l.references ?? [];
  async function addRef(e: FormEvent) {
    e.preventDefault();
    const ok = await onPatch({ action: "reference_add", kind, referee_name: who, contact, method, notes });
    if (ok) { setWho(""); setContact(""); setNotes(""); setAdding(false); }
  }
  return (
    <div style={{ background: "var(--cream)", borderRadius: 10, padding: 12, margin: "6px 0 8px", display: "grid", gap: 10, fontSize: 13 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={!!l.id_checked_at} disabled={busy} onChange={(e) => void onPatch({ action: "check", id_checked: e.target.checked })} /> ID seen{l.id_checked_at ? <span className="muted"> · {formatShortDate(l.id_checked_at)}</span> : null}</label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={!!l.benefit_checked_at} disabled={busy} onChange={(e) => void onPatch({ action: "check", benefit_checked: e.target.checked })} /> Proof of benefit seen{l.benefit_checked_at ? <span className="muted"> · {formatShortDate(l.benefit_checked_at)}</span> : null}</label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={l.no_reference_needed} disabled={busy} onChange={(e) => void onPatch({ action: "check", no_reference_needed: e.target.checked })} /> No reference needed <span className="muted">(e.g. professionally referred)</span></label>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>The ID and the proof of benefit themselves are filed in section 7 of the sign-up pack once they&apos;re a tenant.</p>
      {refs.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {refs.map((r) => { const oc = REFERENCE_OUTCOMES.find((o) => o.key === r.outcome) ?? REFERENCE_OUTCOMES[0]; return (
            <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "var(--surface)", borderRadius: 8, padding: "8px 10px", borderLeft: `4px solid ${oc.colour}` }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <b>{r.referee_name}</b> <span className="muted">· {REFERENCE_KINDS.find((k) => k.key === r.kind)?.label ?? r.kind}{r.contact ? ` · ${r.contact}` : ""}{r.method ? ` · ${REFERENCE_METHODS.find((m) => m.key === r.method)?.label.toLowerCase()}` : ""}</span>
                <div className="muted" style={{ fontSize: 12 }}>Asked {formatShortDate(r.requested_at)}{r.received_at ? ` · answered ${formatShortDate(r.received_at)}` : ""}{r.created_by ? ` · by ${r.created_by}` : ""}{r.notes ? ` · ${r.notes}` : ""}</div>
              </div>
              <select value={r.outcome} disabled={busy} onChange={(e) => void onPatch({ action: "reference_update", reference_id: r.id, outcome: e.target.value })} style={{ ...inp, width: "auto", minHeight: 32, padding: "4px 8px", fontSize: 12.5, color: oc.colour, fontWeight: 600 }}>
                {REFERENCE_OUTCOMES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <button type="button" className="btn ghost sm" style={{ minHeight: 28, padding: "0 8px", fontSize: 12, color: "var(--brick)" }} disabled={busy} onClick={() => { if (window.confirm("Remove this reference?")) void onPatch({ action: "reference_remove", reference_id: r.id }); }}>Remove</button>
            </div>); })}
        </div>
      )}
      {adding ? (
        <form onSubmit={addRef} style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", background: "var(--surface)", borderRadius: 8, padding: 10 }}>
          <label><span className="lbl">Who from</span><select value={kind} onChange={(e) => setKind(e.target.value)} style={inp}>{REFERENCE_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select></label>
          <label><span className="lbl">Name</span><input value={who} onChange={(e) => setWho(e.target.value)} required placeholder="e.g. Sarah Khan" style={inp} /></label>
          <label><span className="lbl">Phone or email</span><input value={contact} onChange={(e) => setContact(e.target.value)} style={inp} /></label>
          <label><span className="lbl">How</span><select value={method} onChange={(e) => setMethod(e.target.value)} style={inp}>{REFERENCE_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></label>
          <label style={{ gridColumn: "1 / -1" }}><span className="lbl">Notes</span><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Promised by Friday · ask about arrears" style={inp} /></label>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}><button type="submit" className="rel sm" disabled={busy || !who.trim()}>Reference asked</button><button type="button" className="btn ghost sm" onClick={() => setAdding(false)}>Cancel</button></div>
        </form>
      ) : <div><button type="button" className="btn ghost sm" disabled={busy} onClick={() => setAdding(true)}>+ Ask for another reference</button></div>}
    </div>
  );
}

function BookViewing({ l, staff, properties, me, busy, onClose, onSave }: { l: Lead; staff: Staff[]; properties: PropertyOpt[]; me: string; busy: boolean; onClose: () => void; onSave: (b: Record<string, unknown>) => void }) {
  const toLocal = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const [when, setWhen] = useState(l.viewing_at ? toLocal(l.viewing_at) : "");
  const [who, setWho] = useState(l.assigned_to ?? me);
  const [propertyId, setPropertyId] = useState(l.property_id ?? "");
  const [unitId, setUnitId] = useState(l.unit_id ?? "");
  const [notes, setNotes] = useState("");
  const prop = properties.find((p) => p.id === propertyId);
  const units = (prop?.units ?? []).slice().sort((a, b) => a.reference.localeCompare(b.reference, undefined, { numeric: true }));
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,28,46,.5)", display: "grid", placeItems: "center", zIndex: 1200, padding: 16 }} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onSave({ viewing_at: new Date(when).toISOString(), assigned_to: who || null, property_id: propertyId || null, unit_id: unitId || null, notes: notes || undefined }); }}
        style={{ background: "#fff", borderRadius: 14, padding: 20, width: "100%", maxWidth: 480, display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>{l.viewing_at ? "Rebook" : "Book"} the viewing · {l.full_name}</h3>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>It goes into the diary of whoever does it, at the room they&apos;ll see.</p>
        <DateTimeField label="When" value={when} onChange={setWhen} required />
        <label><span className="lbl">Who does it</span><select value={who} onChange={(e) => setWho(e.target.value)} style={inp}><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.full_name}>{s.full_name}{s.full_name === me ? " (you)" : ""}</option>)}</select></label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label><span className="lbl">Property</span><select value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setUnitId(""); }} style={inp}><option value="">Not decided</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}{p.landlordName ? ` · ${p.landlordName}` : ""}</option>)}</select></label>
          <label><span className="lbl">Room</span><select value={unitId} onChange={(e) => setUnitId(e.target.value)} style={inp} disabled={!propertyId}><option value="">Any room</option>{units.map((u) => <option key={u.id} value={u.id}>{/^\d+$/.test(u.reference) ? `Room ${u.reference}` : u.reference}{u.status === "occupied" ? " · taken" : ""}</option>)}</select></label>
        </div>
        {prop && <p className="muted" style={{ margin: 0, fontSize: 12 }}>{prop.name} has {units.length} room{units.length === 1 ? "" : "s"} on the system{units.length <= 1 ? <> — <Link href={`/properties/${prop.id}`} style={{ color: "var(--amber-deep)" }}>add the rest on the property page</Link> and they&apos;ll show here.</> : "."}</p>}
        <label><span className="lbl">Note for the diary (optional)</span><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Meet at the front door · bring the key for room 2" style={inp} /></label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button type="button" className="btn ghost sm" onClick={onClose}>Cancel</button><button type="submit" className="rel sm" disabled={!when || busy}>{busy ? "Booking…" : "Book → diary"}</button></div>
      </form>
    </div>, document.body);
}

const inp: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
