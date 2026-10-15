"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatShortDate } from "../../lib/format";
import type { Station } from "../../lib/journey";
import type { TenantJourney } from "../../lib/journey-server";
import { uploadFile } from "../files/upload";
import { REFERRAL_SOURCES } from "../../lib/signup";
import { DateTimeField } from "../form/DateTimeField";

/**
 * The eight stations on the tenant's own page (Matloob, 2026-10-14):
 * green = done, red = not yet, grey = not needed for this landlord. Click a
 * station: what it means, what to do, and the one button that does it —
 * tick (viewing, moved out), assign (viewing), or upload the evidence
 * (signed agreement, HB form, the council email screenshot, the portal).
 * Evidence stations only ever turn green because the document exists.
 */
export function JourneyStrip({ tenantId, onDocumentsChanged }: { tenantId: string; onDocumentsChanged?: () => void }) {
  const [j, setJ] = useState<TenantJourney | null>(null);
  const [open, setOpen] = useState<Station["key"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignee, setAssignee] = useState("");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const [people, setPeople] = useState<Array<{ id: string; full_name: string }>>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { const r = await fetch(`/api/tenants/${tenantId}/journey`); if (r.ok) setJ(await r.json()); } catch { /* keep */ }
  }, [tenantId]);
  useEffect(() => { void load(); fetch("/api/profiles").then((r) => (r.ok ? r.json() : [])).then((d) => setPeople(Array.isArray(d) ? d : [])).catch(() => {}); }, [load]);

  async function tick(station: Station["key"], done: boolean, extra: Record<string, unknown> = {}) {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/tenants/${tenantId}/journey`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ station, done, ...extra }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "Could not update"); return; }
      setJ(b); setNote(""); setWhen("");
    } catch { setError("Could not reach the server."); } finally { setBusy(false); }
  }
  async function evidence(s: Station, file: File) {
    if (!s.evidenceType) return;
    setBusy(true); setError(null);
    try {
      await uploadFile({ entity: "tenant", id: tenantId, kind: "document", type: s.evidenceType, file });
      await load(); onDocumentsChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); } finally { setBusy(false); }
  }

  if (!j) return null;
  const sel = j.stations.find((s) => s.key === open) ?? null;
  // One station at a time (Matloob): a to-do station is locked while any earlier required station is still to do.
  const locked = !!sel && sel.status === "todo" && j.stations.some((s) => s.n < sel.n && s.status === "todo");
  const colour = (s: Station) => s.status === "done" ? "var(--live)" : s.status === "na" ? "#CBD2DB" : s.current ? "var(--amber-deep)" : "#8FA0B4";
  const lastDone = j.stations.reduce((m, s, i) => (s.status === "done" ? i : m), -1);

  return (
    <section className="card" style={{ margin: "14px 0 6px" }}>
      <div className="ch">
        <h3>Journey <span className="muted" style={{ fontWeight: 500 }}>· {j.done} of {j.total} stations done{j.landlord ? ` · ${j.landlord}` : ""}</span></h3>
        {j.next && <span className="muted" style={{ fontSize: 12.5 }}>Next: <b style={{ color: "var(--brick)" }}>{j.next.n} · {j.next.label}</b></span>}
      </div>
      <div style={{ display: "flex", gap: 0, padding: "14px 18px 6px", overflowX: "auto" }}>
        {j.stations.map((s, i) => {
          const done = s.status === "done"; const na = s.status === "na";
          return (
          <div key={s.key} style={{ display: "flex", alignItems: "flex-start", flex: "1 0 auto", minWidth: 96 }}>
            <button type="button" onClick={() => setOpen(open === s.key ? null : s.key)} aria-pressed={open === s.key}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 96, padding: 0 }}>
              <span className={s.current ? "jd-now" : undefined} style={{ width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14, boxSizing: "border-box", transition: "background .4s, transform .2s", transform: open === s.key ? "scale(1.12)" : undefined,
                background: done ? "var(--live)" : s.current ? "var(--amber)" : na ? "#E6E0D6" : "#fff",
                color: done ? "#fff" : s.current ? "var(--navy)" : "#8FA0B4",
                border: done || s.current ? "none" : `2px solid ${na ? "#E6E0D6" : s.heldBy ? "var(--amber)" : "#D9D2C6"}`,
                boxShadow: done ? "0 0 0 4px rgba(30,127,79,.16)" : open === s.key ? "0 0 0 4px rgba(15,28,46,.12)" : undefined }}>{done ? "✓" : s.n}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: na ? "var(--slate-2)" : s.current ? "var(--amber-deep)" : "var(--navy)", textAlign: "center", lineHeight: 1.2 }}>{s.label}</span>
              <span style={{ fontSize: 10.5, color: "var(--slate)", textAlign: "center" }}>{done ? (s.doneAt ? formatShortDate(s.doneAt) : "done") : na ? "not needed" : s.current ? "now" : s.heldBy ? "on file · waits" : s.assignedTo ? `→ ${s.assignedTo}` : "later"}</span>
            </button>
            {i < j.stations.length - 1 && (
              <span style={{ flex: 1, height: 4, marginTop: 16, background: "#E6E0D6", borderRadius: 2, minWidth: 8, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", background: "var(--live)", borderRadius: 2, transition: "width .7s ease", width: i < lastDone ? "100%" : i === lastDone ? "55%" : "0%" }} />
              </span>
            )}
          </div>
          );
        })}
      </div>

      {sel && (
        <div className="li" style={{ display: "grid", gap: 10, background: "var(--cream)" }}>
          <div><b>{sel.n} · {sel.label}</b> <span className="tag" style={{ marginLeft: 6, background: sel.status === "done" ? "rgba(30,127,79,.12)" : sel.status === "na" ? "rgba(15,28,46,.06)" : sel.current ? "rgba(232,168,76,.2)" : "rgba(15,28,46,.06)", color: colour(sel) === "#CBD2DB" ? "var(--slate)" : colour(sel) }}>{sel.status === "done" ? "Done" : sel.status === "na" ? "Not needed" : sel.current ? "Now" : sel.heldBy ? "Waiting" : "Later"}</span>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>{sel.what}</p>
            {sel.heldBy && <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--amber-deep)", fontWeight: 600 }}>{sel.evidenceFound ? `"${sel.evidenceFound}" is on file` : "This is done"} — it turns green once station {sel.heldBy} ({j.stations[sel.heldBy - 1]!.label}) is, so the journey reads in order.</p>}
            {sel.status === "done" && (sel.by || sel.evidenceFound) && <p className="muted" style={{ margin: "2px 0 0", fontSize: 12.5 }}>{sel.evidenceFound ? `Evidence on file: ${sel.evidenceFound}` : `Ticked by ${sel.by}`}{sel.note ? ` · ${sel.note}` : ""}</p>}
          </div>

          {/* One station at a time: the next one opens only when the one before is done. */}
          {locked && <p style={{ margin: 0, fontSize: 13, color: "var(--brick)" }}>Finish station {j.stations.find((s) => s.n < sel.n && s.status === "todo")!.n} ({j.stations.find((s) => s.n < sel.n && s.status === "todo")!.label}) first — the journey goes one station at a time.</p>}

          {/* Station 3 opens the sign-up pack, full page. */}
          {sel.key === "signed_up" && !locked && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Link href={`/tenants/${tenantId}/signup`} className="rel sm">Open the sign-up pack →</Link>
              <span className="muted" style={{ fontSize: 12.5 }}>Seven sections; each form filled from the record, signed on the pad, filed.</span>
            </div>
          )}

          {/* Evidence stations: the only way to green is the document. */}
          {sel.evidenceType && sel.status !== "done" && !locked && sel.key !== "signed_up" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" className="rel sm" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Uploading…" : `Upload: ${sel.evidenceType}`}</button>
              <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void evidence(sel, f); }} />
              <span className="muted" style={{ fontSize: 12 }}>Goes into Documents as &ldquo;{sel.evidenceType}&rdquo;; this station turns green the moment it&apos;s there.</span>
            </div>
          )}
          {sel.key === "onboarded" && sel.status === "todo" && !locked && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Portal reference (optional)" style={inp} />
              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void tick("onboarded", true, { note })}>Or tick: added to the portal</button>
            </div>
          )}

          {/* Station 1: one of three, and it's green. */}
          {sel.key === "lead_received" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {REFERRAL_SOURCES.map((r) => (
                <button key={r.key} type="button" className={j.referralSource === r.key ? "rel sm" : "btn ghost sm"} disabled={busy} title={r.hint} onClick={() => void tick("lead_received", true, { referralSource: r.key })}>{r.label}</button>
              ))}
            </div>
          )}

          {/* Station 2: assign to a person with a time → their diary; tick when done. */}
          {sel.key === "viewing" && !locked && (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select value={assignee || sel.assignedTo || ""} onChange={(e) => setAssignee(e.target.value)} style={inp} aria-label="Assign the viewing to">
                  <option value="">Assign to…</option>{people.map((p) => <option key={p.id} value={p.full_name}>{p.full_name}</option>)}
                </select>
                <DateTimeField value={when} onChange={setWhen} style={{ minWidth: 300 }} />
                <button type="button" className="rel sm" disabled={busy || !(assignee || sel.assignedTo) || !when} onClick={() => void tick("viewing", false, { assignedTo: assignee || sel.assignedTo, at: new Date(when).toISOString() })}>Assign → their diary</button>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {sel.status === "todo" ? <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void tick("viewing", true, { assignedTo: assignee || sel.assignedTo || null })}>Viewing done ✓</button>
                  : <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void tick("viewing", false)}>Undo</button>}
                {sel.assignedTo && <span className="muted" style={{ fontSize: 12.5 }}>Assigned to {sel.assignedTo}{sel.doneAt && sel.status !== "done" ? ` · ${formatShortDate(sel.doneAt)}` : ""}</span>}
              </div>
            </div>
          )}
          {/* Station 4: confirm the move-in with its date. */}
          {sel.key === "moved_in" && !locked && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {sel.status === "todo" ? (<>
                <input type="date" value={when} onChange={(e) => setWhen(e.target.value)} style={inp} aria-label="Move-in date" />
                <button type="button" className="rel sm" disabled={busy} onClick={() => void tick("moved_in", true, { doneAt: when || null })}>Confirm moved in ✓</button>
                <span className="muted" style={{ fontSize: 12.5 }}>Puts the move-in date on the record.</span>
              </>) : <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void tick("moved_in", false)}>Undo</button>}
            </div>
          )}
          {sel.key === "moved_out" && !locked && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {sel.status === "todo" ? (<>
                <input type="date" value={when} onChange={(e) => setWhen(e.target.value)} style={inp} aria-label="Move-out date" />
                <button type="button" className="btn ghost sm" disabled={busy} style={{ color: "var(--brick)" }} onClick={() => { if (window.confirm("Record that they've moved out? Their room becomes free.")) void tick("moved_out", true, { doneAt: when || null }); }}>Moved out</button>
              </>) : <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void tick("moved_out", false)}>Undo</button>}
            </div>
          )}
          {error && <p style={{ color: "var(--brick)", margin: 0, fontSize: 13 }}>{error}</p>}
        </div>
      )}
    </section>
  );
}

const inp: React.CSSProperties = { minHeight: 38, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, fontFamily: "inherit", background: "var(--surface)", minWidth: 180 };
