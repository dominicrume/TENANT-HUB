"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { compressImage } from "../lib/compress-image";
import { CameraCapture } from "./CameraCapture";

interface MediaItem { id: string; caption: string | null; uploadedBy: string; createdAt: string; url: string }
interface Pending { name: string; preview: string; status: "waiting" | "uploading" | "done" | "failed"; error?: string }

/**
 * Photo gallery for a property or a room — same component, different owner.
 * Rebuilt after the 2026-10-09 walkthrough ("a more robust image-adding feel"):
 *  - pick MANY at once, or drop them on the gallery, or take one with the camera
 *  - each file shows as it uploads (compressed first — a 6MB phone photo
 *    becomes ~300KB), with a per-file result, and the grid fills in as they land
 *  - a photo opens in-app (lightbox, ← → keys), not a raw blob in a new tab
 *  - delete asks first
 * Nothing is kept in browser storage; the grid re-reads the server after every change (H7).
 */
export function MediaGallery({ entityType, entityId, title = "Media" }: { entityType: "property" | "unit"; entityId: string; title?: string }) {
  const base = entityType === "property" ? `/api/properties/${entityId}/media` : `/api/units/${entityId}/media`;
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  const busy = pending.some((p) => p.status === "waiting" || p.status === "uploading");

  const load = useCallback(async () => {
    const res = await fetch(base);
    if (res.ok) setItems(await res.json()); // a failed refresh keeps the grid as it was (H8)
  }, [base]);
  useEffect(() => { void load(); }, [load]);

  async function addFiles(list: FileList | File[]) {
    const files = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    const start = pending.length;
    const next: Pending[] = files.map((f) => ({ name: f.name, preview: URL.createObjectURL(f), status: "waiting" }));
    setPending((p) => [...p, ...next]);
    for (let i = 0; i < files.length; i++) {
      const idx = start + i;
      setPending((p) => p.map((x, j) => (j === idx ? { ...x, status: "uploading" } : x)));
      try {
        const compressed = await compressImage(files[i]!);
        const form = new FormData();
        form.append("file", compressed);
        const res = await fetch(base, { method: "POST", body: form });
        if (!res.ok) { const b = await res.json().catch(() => null); throw new Error(b?.error ?? "Could not upload"); }
        setPending((p) => p.map((x, j) => (j === idx ? { ...x, status: "done" } : x)));
        await load();
      } catch (err) {
        setPending((p) => p.map((x, j) => (j === idx ? { ...x, status: "failed", error: err instanceof Error ? err.message : "Upload failed" } : x)));
      }
    }
    // Clear the finished ones after a beat; failures stay until dismissed.
    setTimeout(() => setPending((p) => { p.filter((x) => x.status === "done").forEach((x) => URL.revokeObjectURL(x.preview)); return p.filter((x) => x.status !== "done"); }), 1200);
  }

  async function handleRemove(id: string) {
    if (!window.confirm("Remove this photo? This can't be undone.")) return;
    setRemovingId(id);
    try { await fetch(`/api/media/${id}`, { method: "DELETE" }); await load(); if (open !== null) setOpen(null); }
    finally { setRemovingId(null); }
  }

  // Lightbox keys
  useEffect(() => {
    if (open === null || !items) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? null : (i + 1) % items.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? null : (i - 1 + items.length) % items.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items]);

  const count = items?.length ?? 0;
  return (
    <section
      className="card"
      style={{ marginBottom: 18, outline: dragOver ? "2px dashed var(--amber)" : "none", outlineOffset: -2 }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); void addFiles(e.dataTransfer.files); }}
    >
      <div className="ch" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>{title}{count > 0 && <span className="muted" style={{ fontWeight: 500, marginLeft: 8 }}>{count} photo{count === 1 ? "" : "s"}</span>}</h3>
        <div className="btns">
          <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setCamera(true)} title="Take a photo now">📷 Take photo</button>
          <button type="button" className="rel sm" disabled={busy} onClick={() => fileInputRef.current?.click()}>{busy ? "Uploading…" : "+ Add photos"}</button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
      </div>
      {camera && <CameraCapture facing="environment" title={`Add a photo · ${title}`} onClose={() => setCamera(false)} onCapture={(f) => void addFiles([f])} />}

      {(items === null) ? (
        <div className="li"><p className="muted">Loading…</p></div>
      ) : (items.length === 0 && pending.length === 0) ? (
        <button type="button" className="li" onClick={() => fileInputRef.current?.click()} style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "block" }}>
          <div style={{ border: "2px dashed var(--line)", borderRadius: 12, padding: "22px 16px", textAlign: "center", color: "var(--slate)", fontSize: 13.5 }}>
            <div style={{ fontSize: 26, marginBottom: 6 }}>🖼️</div>
            <b style={{ color: "var(--navy)" }}>Drop photos here</b> or click to choose — several at once is fine.<br />
            <span className="muted">Front of the building, each room, kitchen, bathroom, meters, any damage.</span>
          </div>
        </button>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, padding: "12px 16px 16px" }}>
          {items.map((it, i) => (
            <div key={it.id} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: "#F0EEE9", boxShadow: "0 1px 2px rgba(15,28,46,.08)" }}>
              <button type="button" onClick={() => setOpen(i)} style={{ position: "absolute", inset: 0, border: "none", background: "transparent", padding: 0, cursor: "zoom-in" }} aria-label="Open photo">
                {/* unoptimized: /api/media/[id] is session-gated; next/image's optimizer fetches server-side without the cookie and would always render broken. */}
                <Image src={it.url} alt={it.caption ?? "Photo"} fill sizes="140px" style={{ objectFit: "cover" }} unoptimized />
              </button>
              {i === 0 && <span style={{ position: "absolute", left: 6, bottom: 6, background: "rgba(15,28,46,.78)", color: "#fff", fontSize: 10.5, fontWeight: 600, padding: "2px 7px", borderRadius: 20 }}>Cover</span>}
              <button type="button" onClick={() => void handleRemove(it.id)} disabled={removingId === it.id} title="Remove photo" aria-label="Remove photo"
                style={{ position: "absolute", top: 5, right: 5, width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(15,28,46,0.72)", color: "#fff", fontSize: 12, cursor: "pointer", lineHeight: "24px" }}>
                {removingId === it.id ? "…" : "✕"}
              </button>
            </div>
          ))}
          {pending.map((p, i) => (
            <div key={`p${i}`} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: "#F0EEE9", opacity: p.status === "done" ? 1 : 0.85 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, nothing to optimize */}
              <img src={p.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: p.status === "failed" ? "grayscale(1)" : undefined }} />
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: p.status === "failed" ? "rgba(178,74,49,.55)" : "rgba(15,28,46,.35)", color: "#fff", fontSize: 12, fontWeight: 600, textAlign: "center", padding: 6 }}>
                {p.status === "waiting" && "Waiting…"}
                {p.status === "uploading" && <span><span className="dot" style={{ display: "inline-block", marginRight: 5, animation: "pulse 1s ease-in-out infinite" }} />Uploading</span>}
                {p.status === "done" && "✓ Added"}
                {p.status === "failed" && <span>{p.error}<br /><button type="button" onClick={() => setPending((q) => q.filter((_, j) => j !== i))} style={{ marginTop: 6, background: "#fff", color: "var(--brick)", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>Dismiss</button></span>}
              </div>
            </div>
          ))}
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy} aria-label="Add more photos"
            style={{ aspectRatio: "1", borderRadius: 10, border: "2px dashed var(--line)", background: "transparent", color: "var(--slate)", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
            + Add more
          </button>
        </div>
      )}

      {open !== null && items && items[open] && createPortal(
        <div role="dialog" aria-label="Photo" onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(15,28,46,.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "min(92vw, 1000px)", height: "min(82vh, 760px)" }}>
            <Image src={items[open]!.url} alt={items[open]!.caption ?? "Photo"} fill sizes="92vw" style={{ objectFit: "contain" }} unoptimized />
          </div>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", bottom: 18, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 10, color: "#fff", fontSize: 13 }}>
            <button type="button" className="btn ghost sm" onClick={() => setOpen((open - 1 + items.length) % items.length)} style={{ color: "#fff", borderColor: "rgba(255,255,255,.4)", background: "transparent" }}>← Prev</button>
            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{open + 1} / {items.length}</span>
            <button type="button" className="btn ghost sm" onClick={() => setOpen((open + 1) % items.length)} style={{ color: "#fff", borderColor: "rgba(255,255,255,.4)", background: "transparent" }}>Next →</button>
            <a href={items[open]!.url} download className="btn ghost sm" style={{ color: "#fff", borderColor: "rgba(255,255,255,.4)", background: "transparent" }}>Download</a>
            <button type="button" className="btn ghost sm" onClick={() => void handleRemove(items[open]!.id)} style={{ color: "#FFB4A8", borderColor: "rgba(255,255,255,.4)", background: "transparent" }}>Remove</button>
          </div>
          <button type="button" onClick={() => setOpen(null)} aria-label="Close" style={{ position: "absolute", top: 14, right: 16, width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.14)", color: "#fff", fontSize: 18, cursor: "pointer" }}>✕</button>
          <div style={{ position: "absolute", top: 20, left: 20, color: "#CBD6E4", fontSize: 12.5 }}>Added by {items[open]!.uploadedBy}</div>
        </div>,
        document.body,
      )}
    </section>
  );
}
