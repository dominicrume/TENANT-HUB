"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SIGNUP_SECTIONS, slotMatches, type SignupSlot } from "../../lib/signup";
import { uploadFile, type FileItemView, type FilesResponse } from "../files/upload";
import { FileViewer } from "../files/FileViewer";
import { CameraCapture } from "../CameraCapture";
import { formatShortDate } from "../../lib/format";

/**
 * Sign-up pack — station 3 — laid out exactly as Reliance / Ash Shahada /
 * Dawson keep it on their drive: SECTION 1 to SECTION 7 (Osama, 2026-10-14).
 * Every slot shows filed / missing; each one can be filled by upload or
 * photographed; where the app already has the form, "Open form" goes
 * straight to it and the printed/PDF copy can be filed back here. "Always
 * give us the option to add a document" — every section has it.
 * The landlord-letterhead templates for auto-fill + e-signature arrive from
 * Osama; the slots are ready for them.
 */
export function SignupPackTab({ tenantId, onOpenTab }: { tenantId: string; onOpenTab?: (tab: string) => void }) {
  const [data, setData] = useState<FilesResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [camera, setCamera] = useState<{ slot: string; section: number } | null>(null);
  const [pending, setPending] = useState<{ slot: string; section: number } | null>(null);
  const [otherName, setOtherName] = useState<Record<number, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { const r = await fetch(`/api/files?entity=tenant&id=${tenantId}`); if (r.ok) setData(await r.json()); } catch { /* keep */ }
  }, [tenantId]);
  useEffect(() => { void load(); }, [load]);

  const docs = (data?.items ?? []).filter((f) => f.kind === "document" && f.blobId);
  const viewable = docs;
  const filed = (slot: SignupSlot) => docs.find((d) => slotMatches(slot, d.name)) ?? null;

  async function put(slot: string, section: number, file: File) {
    setBusy(slot); setError(null);
    try { await uploadFile({ entity: "tenant", id: tenantId, kind: "document", type: slot, file, section }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(null); setPending(null); }
  }

  const totalSlots = SIGNUP_SECTIONS.reduce((s, x) => s + x.slots.length, 0);
  const filedCount = SIGNUP_SECTIONS.reduce((s, x) => s + x.slots.filter((sl) => filed(sl)).length, 0);

  return (
    <div style={{ marginTop: 20 }}>
      <div className="ch" style={{ padding: 0, border: "none", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Sign-up pack <span className="muted" style={{ fontWeight: 500 }}>· {filedCount} of {totalSlots} on file</span></h3>
        <Link href={`/tenants/${tenantId}/print`} target="_blank" className="btn ghost sm">Print the dossier</Link>
      </div>
      <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>Seven sections, the way the folders are kept. Fill a slot by uploading or photographing the signed form; where the form lives in the app, open it, print to PDF, and file it here. The licence agreement in section 1 is what turns station 3 green.</p>
      {error && <p style={{ color: "var(--brick)", fontSize: 13 }}>{error}</p>}

      {SIGNUP_SECTIONS.map((sec) => {
        const extra = docs.filter((d) => d.section === sec.n && !sec.slots.some((sl) => slotMatches(sl, d.name)));
        const have = sec.slots.filter((sl) => filed(sl)).length;
        return (
          <section className="card" key={sec.n} style={{ marginBottom: 14 }}>
            <div className="ch">
              <h3>Section {sec.n}{sec.title !== `Section ${sec.n}` ? <span className="muted" style={{ fontWeight: 500 }}> · {sec.title}</span> : null}</h3>
              <span className="muted">{sec.slots.length === 0 ? "nothing required yet" : `${have} / ${sec.slots.length}`}</span>
            </div>
            {sec.slots.map((sl) => {
              const f = filed(sl);
              const vi = f ? viewable.findIndex((v) => v.id === f.id) : -1;
              return (
                <div className="li" key={sl.name} style={{ alignItems: "center" }}>
                  <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: "50%", background: f ? "var(--live)" : "var(--brick)", color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, flex: "none" }}>{f ? "✓" : "!"}</span>
                  <div className="body">
                    <b>{sl.name}{sl.pdf && <span className="tag" style={{ marginLeft: 6, background: "rgba(15,28,46,.06)", color: "var(--navy)", fontSize: 10.5 }}>PDF</span>}</b>
                    <p>{f ? `${f.name} · ${formatShortDate(f.createdAt)}${f.uploadedBy ? ` · ${f.uploadedBy}` : ""}` : "Not on file yet"}</p>
                  </div>
                  <div className="btns">
                    {f && vi >= 0 && <button type="button" className="btn ghost sm" onClick={() => setOpen(vi)}>View</button>}
                    {sl.form && onOpenTab && <button type="button" className="btn ghost sm" onClick={() => onOpenTab(sl.form!)}>Open form</button>}
                    <button type="button" className="btn ghost sm" disabled={busy === sl.name} onClick={() => setCamera({ slot: sl.name, section: sec.n })}>📷</button>
                    <button type="button" className={f ? "btn ghost sm" : "rel sm"} disabled={busy === sl.name} onClick={() => { setPending({ slot: sl.name, section: sec.n }); fileRef.current?.click(); }}>{busy === sl.name ? "Uploading…" : f ? "Replace" : "Upload"}</button>
                  </div>
                </div>
              );
            })}
            {extra.map((d) => { const vi = viewable.findIndex((v) => v.id === d.id); return (
              <div className="li" key={d.id} style={{ alignItems: "center" }}>
                <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--live)", color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, flex: "none" }}>✓</span>
                <div className="body"><b>{d.name}</b><p>{formatShortDate(d.createdAt)}{d.uploadedBy ? ` · ${d.uploadedBy}` : ""}</p></div>
                {vi >= 0 && <button type="button" className="btn ghost sm" onClick={() => setOpen(vi)}>View</button>}
              </div>); })}
            <div className="li" style={{ background: "var(--cream)", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <input value={otherName[sec.n] ?? ""} onChange={(e) => setOtherName((o) => ({ ...o, [sec.n]: e.target.value }))} placeholder="Add another document to this section — name it" style={{ ...inp, flex: 1, minWidth: 220 }} />
              <button type="button" className="btn ghost sm" disabled={!(otherName[sec.n] ?? "").trim()} onClick={() => { setPending({ slot: otherName[sec.n]!.trim(), section: sec.n }); fileRef.current?.click(); }}>+ Add document</button>
            </div>
          </section>
        );
      })}

      <input ref={fileRef} type="file" accept="application/pdf,image/*,.doc,.docx" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && pending) void put(pending.slot, pending.section, f); }} />
      {camera && <CameraCapture facing="environment" title={`Photograph: ${camera.slot}`} onClose={() => setCamera(null)} onCapture={(f) => void put(camera.slot, camera.section, f)} />}
      {open !== null && viewable[open] && <FileViewer items={viewable} index={open} onClose={() => setOpen(null)} onChange={setOpen} canEdit={false} />}
    </div>
  );
}

const inp: React.CSSProperties = { minHeight: 38, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, fontFamily: "inherit", background: "var(--surface)" };
