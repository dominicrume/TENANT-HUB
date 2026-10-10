"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { compressImage } from "../lib/compress-image";
import { CameraCapture } from "./CameraCapture";

/**
 * A profile photo that behaves the way people expect from their phone
 * (Rume, 2026-10-09: "just like WhatsApp — see it, change it, remove it"):
 *  - hover: a small "view" hint; click: the photo opens large, in-app
 *  - in the viewer: Change photo · Take photo · Remove · Close
 *  - no photo yet: initials, and the same viewer offers to add one
 * The component owns none of the storage: the parent passes the URL and
 * the upload/remove calls (tenant, landlord, staff profile all differ).
 * Images are compressed in the browser before upload (a 6MB phone photo
 * → ~300KB). `unoptimized` because every photo route is session-gated.
 */
export function AvatarPhoto({
  src, name, size = 72, editable = false, interactive = true, onUpload, onRemove, shape = "circle",
}: {
  src: string | null; name: string; size?: number; editable?: boolean; interactive?: boolean;
  onUpload?: (file: File) => Promise<void>; onRemove?: () => Promise<void>; shape?: "circle" | "square";
}) {
  const [broken, setBroken] = useState(false);
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  const [camera, setCamera] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setBroken(false); }, [src]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const initials = name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  const has = Boolean(src) && !broken;
  const url = src ? `${src}${src.includes("?") ? "&" : "?"}v=${version}` : null;
  const radius = shape === "circle" ? "50%" : 12;

  async function pick(file: File | undefined) {
    if (!file || !onUpload) return;
    setBusy("upload"); setError(null);
    try {
      const compressed = file.type.startsWith("image/") ? await compressImage(file) : file;
      await onUpload(compressed);
      setBroken(false); setVersion((v) => v + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "The photo did not save"); }
    finally { setBusy(null); }
  }

  async function remove() {
    if (!onRemove || !window.confirm("Remove this photo?")) return;
    setBusy("remove"); setError(null);
    try { await onRemove(); setBroken(true); setVersion((v) => v + 1); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not remove the photo"); }
    finally { setBusy(null); }
  }

  const face = (
    <div style={{ position: "relative", width: size, height: size, borderRadius: radius, overflow: "hidden", background: "var(--navy)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 600, fontSize: Math.max(12, size / 2.6), flex: "none", boxShadow: "0 1px 3px rgba(15,28,46,.18)" }}>
      {has && url ? <Image src={url} alt={name} fill sizes={`${size}px`} style={{ objectFit: "cover" }} unoptimized onError={() => setBroken(true)} /> : initials}
      {interactive && hover && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(15,28,46,.45)", display: "grid", placeItems: "center", color: "#fff", fontSize: Math.max(10, size / 6), fontWeight: 600 }}>
          {has ? "View" : editable ? "Add photo" : ""}
        </div>
      )}
    </div>
  );

  if (!interactive) return face;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        title={has ? "View photo" : editable ? "Add a photo" : name} aria-label={has ? "View photo" : "Add a photo"}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", borderRadius: radius, display: "block" }}>
        {face}
      </button>

      {camera && <CameraCapture facing="user" title={`Photo of ${name}`} onClose={() => setCamera(false)} onCapture={(f) => void pick(f)} />}

      {/* Portal: the topbar is position:sticky with its own stacking context,
          which trapped this fixed overlay underneath the person menu. */}
      {open && createPortal(
        <div role="dialog" aria-label={`${name} — photo`} onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(15,28,46,.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "min(80vw, 520px)", height: "min(60vh, 520px)", borderRadius: 16, overflow: "hidden", background: "var(--navy)", display: "grid", placeItems: "center", color: "#fff", fontSize: 96, fontWeight: 600 }}>
            {has && url ? <Image src={url} alt={name} fill sizes="520px" style={{ objectFit: "contain" }} unoptimized /> : initials}
            {busy && <div style={{ position: "absolute", inset: 0, background: "rgba(15,28,46,.6)", display: "grid", placeItems: "center", fontSize: 15 }}>{busy === "upload" ? "Saving photo…" : "Removing…"}</div>}
          </div>
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 14, color: "#fff", textAlign: "center" }}>
            <b style={{ fontSize: 16 }}>{name}</b>
            {error && <p style={{ margin: "6px 0 0", color: "#FFB4A8", fontSize: 13 }}>{error}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 12 }}>
              {editable && onUpload && <button type="button" className="btn ghost sm" style={lightBtn} disabled={busy !== null} onClick={() => fileRef.current?.click()}>{has ? "Change photo" : "Choose photo"}</button>}
              {editable && onUpload && <button type="button" className="btn ghost sm" style={lightBtn} disabled={busy !== null} onClick={() => setCamera(true)}>📷 Take photo</button>}
              {has && url && <a href={url} download className="btn ghost sm" style={lightBtn}>Download</a>}
              {editable && onRemove && has && <button type="button" className="btn ghost sm" style={{ ...lightBtn, color: "#FFB4A8" }} disabled={busy !== null} onClick={() => void remove()}>Remove</button>}
              <button type="button" className="btn ghost sm" style={lightBtn} onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        </div>,
        document.body,
      )}
    </>
  );
}

const lightBtn: React.CSSProperties = { color: "#fff", borderColor: "rgba(255,255,255,.4)", background: "transparent" };
