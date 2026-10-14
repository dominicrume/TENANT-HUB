/**
 * /tenants/[id]/signup/[section] — one section's forms: filled / signed /
 * missing, "Fill & sign" for the ones we generate, upload or photograph for
 * anything on paper, "Add document" always there.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SIGNUP_SECTIONS, slotMatches } from "../../../../../../lib/signup";
import { uploadFile, type FilesResponse } from "../../../../../../components/files/upload";
import { FileViewer } from "../../../../../../components/files/FileViewer";
import { CameraCapture } from "../../../../../../components/CameraCapture";
import { formatShortDate } from "../../../../../../lib/format";

export default function SignupSectionPage() {
  const { id, section } = useParams<{ id: string; section: string }>();
  const n = Number(section);
  const sec = SIGNUP_SECTIONS.find((s) => s.n === n);
  const [files, setFiles] = useState<FilesResponse | null>(null);
  const [tenant, setTenant] = useState<{ full_name: string } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [camera, setCamera] = useState<string | null>(null);
  const [extraName, setExtraName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { const r = await fetch(`/api/files?entity=tenant&id=${id}`); if (r.ok) setFiles(await r.json()); } catch { /* keep */ }
  }, [id]);
  useEffect(() => { void load(); fetch(`/api/tenants/${id}`).then((r) => (r.ok ? r.json() : null)).then(setTenant).catch(() => {}); }, [id, load]);

  if (!sec) return <div style={{ padding: "1.75rem" }}><p style={{ color: "var(--brick)" }}>No such section.</p></div>;
  const docs = (files?.items ?? []).filter((f) => f.kind === "document" && f.blobId);
  const filed = (slotName: string) => { const sl = sec.slots.find((s) => s.name === slotName); return sl ? docs.find((d) => slotMatches(sl, d.name)) ?? null : null; };
  const extra = docs.filter((d) => d.section === n && !sec.slots.some((sl) => slotMatches(sl, d.name)));

  async function put(slot: string, file: File) {
    setBusy(slot); setError(null);
    try { await uploadFile({ entity: "tenant", id, kind: "document", type: slot, file, section: n }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); } finally { setBusy(null); setPending(null); }
  }

  return (
    <div style={{ padding: "1.75rem", maxWidth: 900 }}>
      <p style={{ margin: "0 0 10px", fontSize: 12.5 }}><Link href={`/tenants/${id}`} style={{ color: "var(--slate)" }}>{tenant?.full_name ?? "Tenant"}</Link> <span className="muted">/</span> <Link href={`/tenants/${id}/signup`} style={{ color: "var(--slate)" }}>Sign-up</Link> <span className="muted">/</span> Section {n}</p>
      <h1 style={{ margin: 0 }}>Section {n}{sec.title !== `Section ${n}` ? ` · ${sec.title}` : ""}</h1>
      <p className="sub">{sec.slots.length ? "Fill & sign fills the form from the record and takes the signature on the pad; upload or photograph anything already on paper." : "Nothing is required in this section yet — it stays in the pack because that's how the file is kept. You can still add documents."}</p>
      {error && <p style={{ color: "var(--brick)", fontSize: 13 }}>{error}</p>}

      <section className="card">
        {sec.slots.map((sl) => {
          const f = filed(sl.name); const vi = f ? docs.findIndex((d) => d.id === f.id) : -1;
          return (
            <div className="li" key={sl.name} style={{ alignItems: "center", flexWrap: "wrap" }}>
              <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: "50%", background: f ? "var(--live)" : "var(--brick)", color: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, flex: "none" }}>{f ? "✓" : "!"}</span>
              <div className="body" style={{ minWidth: 200 }}>
                <b>{sl.name}{sl.pdf && <span className="tag" style={{ marginLeft: 6, background: "rgba(15,28,46,.06)", color: "var(--navy)", fontSize: 10.5 }}>PDF</span>}</b>
                <p>{f ? `${f.fileName ?? f.name} · ${formatShortDate(f.createdAt)}${f.uploadedBy ? ` · ${f.uploadedBy}` : ""}` : "Not signed yet"}</p>
              </div>
              <div className="btns">
                {f && vi >= 0 && <button type="button" className="btn ghost sm" onClick={() => setOpen(vi)}>View</button>}
                {f?.downloadUrl && <a href={f.downloadUrl} className="btn ghost sm">Download</a>}
                <Link href={`/tenants/${id}/signup/${n}/${encodeURIComponent(sl.name)}`} className={f ? "btn ghost sm" : "rel sm"}>{f ? "Fill & sign again" : "Fill & sign"}</Link>
                <button type="button" className="btn ghost sm" disabled={busy === sl.name} onClick={() => setCamera(sl.name)} title="Photograph the paper copy">📷</button>
                <button type="button" className="btn ghost sm" disabled={busy === sl.name} onClick={() => { setPending(sl.name); fileRef.current?.click(); }}>{busy === sl.name ? "Uploading…" : "Upload"}</button>
              </div>
            </div>
          );
        })}
        {extra.map((d) => { const vi = docs.findIndex((x) => x.id === d.id); return (
          <div className="li" key={d.id} style={{ alignItems: "center" }}>
            <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--live)", color: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, flex: "none" }}>✓</span>
            <div className="body"><b>{d.name}</b><p>{formatShortDate(d.createdAt)}{d.uploadedBy ? ` · ${d.uploadedBy}` : ""}</p></div>
            <div className="btns">{vi >= 0 && <button type="button" className="btn ghost sm" onClick={() => setOpen(vi)}>View</button>}{d.downloadUrl && <a href={d.downloadUrl} className="btn ghost sm">Download</a>}</div>
          </div>); })}
        <div className="li" style={{ background: "var(--cream)", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input value={extraName} onChange={(e) => setExtraName(e.target.value)} placeholder="Add another document to this section — name it" style={{ ...inp, flex: 1, minWidth: 220 }} />
          <button type="button" className="btn ghost sm" disabled={!extraName.trim()} onClick={() => setCamera(extraName.trim())}>📷</button>
          <button type="button" className="rel sm" disabled={!extraName.trim()} onClick={() => { setPending(extraName.trim()); fileRef.current?.click(); }}>+ Add document</button>
        </div>
      </section>

      <input ref={fileRef} type="file" accept="application/pdf,image/*,.doc,.docx" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && pending) void put(pending, f); }} />
      {camera && <CameraCapture facing="environment" title={`Photograph: ${camera}`} onClose={() => setCamera(null)} onCapture={(f) => void put(camera, f)} />}
      {open !== null && docs[open] && <FileViewer items={docs} index={open} onClose={() => setOpen(null)} onChange={setOpen} canEdit={false} />}
    </div>
  );
}

const inp: React.CSSProperties = { minHeight: 38, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, fontFamily: "inherit", background: "var(--surface)" };
