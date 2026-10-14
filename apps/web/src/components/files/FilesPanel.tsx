"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { CameraCapture } from "../CameraCapture";
import { FileViewer } from "./FileViewer";
import { uploadFile, fileIcon, formatBytes, type FileEntity, type FileItemView, type FilesResponse, type ChecklistItem } from "./upload";
import { formatShortDate } from "../../lib/format";

/**
 * FilesPanel (docs/FILES_SPEC.md §5) — the one component behind every
 * "Media" and "Documents" section: tenant, property, room, landlord.
 *   mode "photos"    → a gallery (property, room)
 *   mode "documents" → typed documents with the required checklist (tenant, property, landlord)
 * Drag-and-drop, many files at once, real per-file progress, camera that is
 * a camera, thumbnails (never full bytes) in the grid, one viewer.
 */
interface Pending { key: string; name: string; preview: string | null; pct: number; status: "uploading" | "done" | "failed"; error?: string }

export function FilesPanel({ entity, id, mode, title, canEdit = true, extraActions, below, onChanged, onAttachRequested, refreshKey }: {
  entity: FileEntity; id: string; mode: "photos" | "documents"; title?: string; canEdit?: boolean; extraActions?: React.ReactNode;
  /** Rendered under the header (e.g. the property's "request from landlord" form). */
  below?: React.ReactNode;
  onChanged?: (r: FilesResponse) => void;
  /** For a "requested" document (property ← landlord): attach the file by hand when it arrives some other way. */
  onAttachRequested?: (f: FileItemView, file: File) => Promise<void>;
  /** Bump to make the panel re-read (e.g. after a request was sent). */
  refreshKey?: number;
}) {
  const [data, setData] = useState<FilesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [camera, setCamera] = useState(false);
  const [docType, setDocType] = useState<string>("");
  const [otherType, setOtherType] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const isPhotos = mode === "photos";

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/files?entity=${entity}&id=${id}`);
      if (!r.ok) { const b = await r.json().catch(() => null); setError(b?.error ?? "Couldn't load files"); return; }
      const j = (await r.json()) as FilesResponse;
      setData(j); onChanged?.(j);
      if (!docType && j.documentTypes[0]) setDocType(j.documentTypes[0]);
    } catch { /* keep what we have (H8) */ }
  }, [entity, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load, refreshKey]);

  const items = (data?.items ?? []).filter((f) => (isPhotos ? f.kind === "photo" : f.kind === "document"));
  const viewable = items.filter((f) => f.blobId);
  const typeLabel = docType === "Other" ? otherType.trim() : docType;

  async function addFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (files.length === 0) return;
    if (!isPhotos && !typeLabel) { setError("Pick what kind of document this is first."); return; }
    setError(null);
    const batch: Pending[] = files.map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : null, pct: 0, status: "uploading" }));
    setPending((p) => [...p, ...batch]);
    for (let i = 0; i < files.length; i++) {
      const key = batch[i]!.key;
      try {
        const res = await uploadFile({ entity, id, kind: isPhotos ? "photo" : "document", type: isPhotos ? "" : typeLabel, file: files[i]!, expiresOn: entity === "landlord" ? expiresOn || null : null,
          onProgress: (pct) => setPending((p) => p.map((x) => (x.key === key ? { ...x, pct } : x))) });
        setPending((p) => p.map((x) => (x.key === key ? { ...x, pct: 100, status: "done" } : x)));
        if (res.items) { setData((d) => (d ? { ...d, items: res.items } : d)); }
      } catch (e) {
        setPending((p) => p.map((x) => (x.key === key ? { ...x, status: "failed", error: e instanceof Error ? e.message : "Upload failed" } : x)));
      }
    }
    await load();
    setTimeout(() => setPending((p) => { p.filter((x) => x.status === "done").forEach((x) => x.preview && URL.revokeObjectURL(x.preview)); return p.filter((x) => x.status !== "done"); }), 1500);
  }

  async function patch(f: FileItemView, body: Record<string, unknown>) {
    const r = await fetch("/api/files/item", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ table: f.table, id: f.id, ...body }) });
    if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.error ?? "Could not save"); }
    await load();
  }
  async function remove(f: FileItemView) {
    const r = await fetch(`/api/files/item?table=${f.table}&id=${f.id}`, { method: "DELETE" });
    if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.error ?? "Could not remove"); }
    setOpen(null);
    await load();
  }

  const counts = data?.counts;
  const heading = title ?? (isPhotos ? "Photos" : "Documents");
  const countText = isPhotos ? (counts ? `${counts.photos} photo${counts.photos === 1 ? "" : "s"}` : "") : (counts ? `${counts.documents} on file${counts.requested ? ` · ${counts.requested} requested` : ""}` : "");

  return (
    <section className="card" style={{ marginBottom: 18, outline: dragOver ? "2px dashed var(--amber)" : "none", outlineOffset: -2 }}
      onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDragOver(true); } }} onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { if (!canEdit) return; e.preventDefault(); setDragOver(false); void addFiles(e.dataTransfer.files); }}>
      <div className="ch" style={{ gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>{heading}{countText && <span className="muted" style={{ fontWeight: 500, marginLeft: 8 }}>{countText}</span>}</h3>
        {canEdit && (
          <div className="btns">
            {extraActions}
            {isPhotos && <button type="button" className="btn ghost sm" onClick={() => setCamera(true)}>📷 Take photo</button>}
            {isPhotos
              ? <button type="button" className="rel sm" onClick={() => fileRef.current?.click()}>+ Add photos</button>
              : <button type="button" className="rel sm" disabled={!typeLabel} title={typeLabel ? "" : "Pick the document type first"} onClick={() => fileRef.current?.click()}>+ Add document</button>}
          </div>
        )}
        <input ref={fileRef} type="file" accept={isPhotos ? "image/*" : "application/pdf,image/*,.doc,.docx,.xls,.xlsx,.csv,.txt"} multiple style={{ display: "none" }}
          onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {below}

      {!isPhotos && canEdit && data && (
        <div className="li" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "var(--cream)" }}>
          <span className="lbl" style={{ margin: 0 }}>Adding:</span>
          <select value={docType} onChange={(e) => setDocType(e.target.value)} style={inp} aria-label="Document type">
            {data.documentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            <option value="Other">Other…</option>
          </select>
          {docType === "Other" && <input value={otherType} onChange={(e) => setOtherType(e.target.value)} placeholder="Describe it" style={{ ...inp, width: 180 }} />}
          {entity === "landlord" && <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} title="Expires on (optional)" style={{ ...inp, width: 160 }} />}
          <button type="button" className="btn ghost sm" onClick={() => setCamera(true)} disabled={!typeLabel}>📷 Photograph it</button>
          <span className="muted" style={{ fontSize: 12 }}>or drop the file anywhere on this card</span>
        </div>
      )}

      {!isPhotos && data && data.checklist.length > 0 && (
        <div className="li" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12, marginRight: 4 }}>Required:</span>
          {data.checklist.map((c) => <ChecklistChip key={c.type} c={c} onPick={() => { if (canEdit) { setDocType(data.documentTypes.includes(c.type) ? c.type : "Other"); if (!data.documentTypes.includes(c.type)) setOtherType(c.type); fileRef.current?.click(); } }} onOpen={() => { const i = viewable.findIndex((f) => f.id === c.fileId); if (i >= 0) setOpen(i); }} />)}
        </div>
      )}

      {error && <p style={{ color: "var(--brick)", fontSize: 13, padding: "8px 18px 0", margin: 0 }}>{error}</p>}

      {data === null ? (
        <div className="li"><p className="muted">Loading…</p></div>
      ) : items.length === 0 && pending.length === 0 ? (
        <button type="button" className="li" disabled={!canEdit} onClick={() => fileRef.current?.click()} style={{ width: "100%", background: "transparent", border: "none", cursor: canEdit ? "pointer" : "default", fontFamily: "inherit", textAlign: "left", display: "block" }}>
          <div style={{ border: "2px dashed var(--line)", borderRadius: 12, padding: "22px 16px", textAlign: "center", color: "var(--slate)", fontSize: 13.5 }}>
            <div style={{ fontSize: 26, marginBottom: 6 }}>{isPhotos ? "🖼️" : "📂"}</div>
            {isPhotos
              ? <><b style={{ color: "var(--navy)" }}>No photos yet.</b> Drop them here, choose several, or take one now.<br /><span className="muted">Front of the building, each room, kitchen, bathroom, meters, any damage.</span></>
              : <><b style={{ color: "var(--navy)" }}>Nothing on file yet.</b> Pick the type above, then drop the file here or photograph it.</>}
          </div>
        </button>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isPhotos ? "repeat(auto-fill, minmax(130px, 1fr))" : "repeat(auto-fill, minmax(190px, 1fr))", gap: 10, padding: "12px 16px 16px" }}>
          {items.map((f) => {
            const vi = viewable.findIndex((v) => v.id === f.id);
            return <FileCard key={f.id} f={f} isPhoto={isPhotos} onOpen={vi >= 0 ? () => setOpen(vi) : undefined}
              onAttach={canEdit && f.status === "requested" && onAttachRequested ? async (file) => { setError(null); try { await onAttachRequested(f, file); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Could not attach"); } } : undefined} />;
          })}
          {pending.map((p) => (
            <div key={p.key} style={{ position: "relative", aspectRatio: isPhotos ? "1" : "4 / 3", borderRadius: 10, overflow: "hidden", background: "#F0EEE9" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
              {p.preview ? <img src={p.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: p.status === "failed" ? "grayscale(1)" : undefined }} /> : <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 32 }}>{fileIcon(null, p.name)}</div>}
              <div style={{ position: "absolute", inset: 0, background: p.status === "failed" ? "rgba(178,74,49,.6)" : "rgba(15,28,46,.4)", color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600, textAlign: "center", padding: 8 }}>
                {p.status === "uploading" && <span>{p.pct < 100 ? `Uploading ${p.pct}%` : "Saving…"}</span>}
                {p.status === "done" && "✓ Added"}
                {p.status === "failed" && <span>{p.error}<br /><button type="button" onClick={() => setPending((q) => q.filter((x) => x.key !== p.key))} style={{ marginTop: 6, background: "#fff", color: "var(--brick)", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>Dismiss</button></span>}
              </div>
              {p.status === "uploading" && <div style={{ position: "absolute", left: 0, bottom: 0, height: 4, width: `${p.pct}%`, background: "var(--amber)" }} />}
            </div>
          ))}
          {canEdit && <button type="button" onClick={() => fileRef.current?.click()} aria-label="Add more" style={{ aspectRatio: isPhotos ? "1" : "4 / 3", borderRadius: 10, border: "2px dashed var(--line)", background: "transparent", color: "var(--slate)", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>+ Add more</button>}
        </div>
      )}

      {camera && <CameraCapture facing={isPhotos ? "environment" : "environment"} title={isPhotos ? `Add a photo · ${heading}` : `Photograph: ${typeLabel}`} onClose={() => setCamera(false)} onCapture={(f) => void addFiles([f])} />}
      {open !== null && viewable[open] && (
        <FileViewer items={viewable} index={open} onClose={() => setOpen(null)} onChange={setOpen} canEdit={canEdit}
          onRename={(f, name) => patch(f, f.kind === "photo" ? { caption: name } : { type: name })}
          onCover={isPhotos ? (f) => patch(f, { isCover: true }) : undefined}
          onRemove={remove} />
      )}
    </section>
  );
}

function FileCard({ f, isPhoto, onOpen, onAttach }: { f: FileItemView; isPhoto: boolean; onOpen?: () => void; onAttach?: (file: File) => Promise<void> }) {
  const [hover, setHover] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const requested = f.status === "requested";
  const body = (
    <>
      <div style={{ position: "relative", aspectRatio: isPhoto ? "1" : "4 / 3", background: "#F0EEE9", borderRadius: isPhoto ? 10 : "10px 10px 0 0", overflow: "hidden" }}>
        {f.thumbUrl ? <Image src={f.thumbUrl} alt={f.name || f.fileName || ""} fill sizes="200px" style={{ objectFit: "cover" }} unoptimized />
          : <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 40, color: requested ? "var(--amber-deep)" : undefined }}>{requested ? "⏳" : fileIcon(f.mimeType, f.fileName)}</div>}
        {f.isCover && <span style={{ position: "absolute", left: 6, bottom: 6, background: "rgba(15,28,46,.78)", color: "#fff", fontSize: 10.5, fontWeight: 600, padding: "2px 7px", borderRadius: 20 }}>★ Cover</span>}
        {hover && onOpen && <div style={{ position: "absolute", inset: 0, background: "rgba(15,28,46,.35)", display: "grid", placeItems: "center", color: "#fff", fontWeight: 600, fontSize: 13 }}>View</div>}
        {isPhoto && f.name && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "14px 8px 6px", background: "linear-gradient(transparent, rgba(15,28,46,.7))", color: "#fff", fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>}
      </div>
      {!isPhoto && (
        <div style={{ padding: "8px 10px 10px" }}>
          <b style={{ display: "block", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</b>
          <small className="muted" style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {requested ? "Requested from the landlord · waiting" : `${formatShortDate(f.createdAt)}${f.size ? ` · ${formatBytes(f.size)}` : ""}${f.uploadedBy ? ` · ${f.uploadedBy}` : ""}`}
          </small>
          {requested && onAttach && (
            <label className="btn ghost sm" style={{ marginTop: 8, cursor: attaching ? "wait" : "pointer", display: "inline-flex" }} onClick={(e) => e.stopPropagation()}>
              {attaching ? "Attaching…" : "Attach received file"}
              <input type="file" style={{ display: "none" }} disabled={attaching} onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; setAttaching(true); try { await onAttach(file); } finally { setAttaching(false); } }} />
            </label>
          )}
        </div>
      )}
    </>
  );
  const style: React.CSSProperties = { textAlign: "left", padding: 0, border: isPhoto ? "none" : "1px solid var(--line)", borderRadius: 10, background: isPhoto ? "transparent" : "var(--surface)", cursor: onOpen ? "zoom-in" : "default", fontFamily: "inherit", overflow: "hidden", boxShadow: "0 1px 2px rgba(15,28,46,.06)", display: "block", width: "100%" };
  return onOpen
    ? <button type="button" onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={style}>{body}</button>
    : <div style={style}>{body}</div>;
}

function ChecklistChip({ c, onPick, onOpen }: { c: ChecklistItem; onPick: () => void; onOpen: () => void }) {
  const tone = c.status === "have" ? { bg: "rgba(30,127,79,.12)", color: "#1E7F4F", mark: "✓" }
    : c.status === "expired" ? { bg: "rgba(224,82,82,.12)", color: "#E05252", mark: "!" }
    : c.status === "requested" ? { bg: "rgba(232,168,76,.16)", color: "var(--amber-deep)", mark: "⏳" }
    : { bg: "rgba(15,28,46,.06)", color: "var(--slate)", mark: "+" };
  return (
    <button type="button" onClick={c.status === "have" || c.status === "expired" ? onOpen : onPick} className="tag"
      title={c.status === "missing" ? `Add ${c.type}` : c.status === "requested" ? "Requested from the landlord" : c.status === "expired" ? "Expired — add a current one" : "On file — open it"}
      style={{ background: tone.bg, color: tone.color, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
      {tone.mark} {c.type}
    </button>
  );
}

const inp: React.CSSProperties = { minHeight: 36, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, fontFamily: "inherit", background: "var(--surface)" };
