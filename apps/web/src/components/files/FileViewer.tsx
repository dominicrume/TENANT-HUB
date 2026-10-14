"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { formatDateTime } from "../../lib/format";
import { fileIcon, formatBytes, type FileItemView } from "./upload";

/**
 * The viewer (docs/FILES_SPEC.md §5): full-screen, in-app. Images with
 * ← →, PDFs inline, anything else as a download card. A details rail that
 * an assessor would want: type, size, who filed it and when, the SHA-256
 * (the same value the audit trail and the ETag carry), share link,
 * download, make cover, rename, remove.
 */
export function FileViewer({ items, index, onClose, onChange, canEdit, onRename, onCover, onRemove }: {
  items: FileItemView[]; index: number; onClose: () => void; onChange: (i: number) => void; canEdit: boolean;
  onRename?: (f: FileItemView, name: string) => Promise<void>; onCover?: (f: FileItemView) => Promise<void>; onRemove?: (f: FileItemView) => Promise<void>;
}) {
  const f = items[index];
  const [shareDays, setShareDays] = useState(7);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(f?.name ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setShareUrl(null); setRenaming(false); setName(f?.name ?? ""); setError(null); }, [index, f?.name]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onChange((index + 1) % items.length);
      if (e.key === "ArrowLeft") onChange((index - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onChange]);

  if (!f || typeof document === "undefined") return null;
  const isImage = (f.mimeType ?? "").startsWith("image/");
  const isPdf = f.mimeType === "application/pdf" || (f.fileName ?? "").toLowerCase().endsWith(".pdf");

  async function share() {
    if (!f?.blobId) return;
    setShareBusy(true); setError(null);
    try {
      const r = await fetch("/api/files/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blobId: f.blobId, days: shareDays, label: f.name || f.fileName }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(b?.error ?? "Could not create the link");
      setShareUrl(b.url);
      try { await navigator.clipboard.writeText(b.url); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* clipboard blocked; URL is shown */ }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create the link"); }
    finally { setShareBusy(false); }
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "That didn't work"); } finally { setBusy(null); }
  }

  return createPortal(
    <div role="dialog" aria-label={f.name || f.fileName || "File"} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 1250, background: "rgba(15,28,46,.94)", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", color: "#fff" }} className="fv">
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", display: "grid", placeItems: "center", padding: 24, minWidth: 0 }}>
        {isImage && f.url ? (
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <Image src={f.url} alt={f.name || f.fileName || "Photo"} fill sizes="100vw" style={{ objectFit: "contain" }} unoptimized />
          </div>
        ) : isPdf && f.url ? (
          <iframe title={f.fileName ?? "Document"} src={f.url} style={{ width: "100%", height: "100%", border: "none", borderRadius: 12, background: "#fff" }} />
        ) : (
          <div style={{ textAlign: "center", padding: 32, background: "rgba(255,255,255,.06)", borderRadius: 16, maxWidth: 420 }}>
            <div style={{ fontSize: 64 }}>{fileIcon(f.mimeType, f.fileName)}</div>
            <b style={{ display: "block", fontSize: 16, margin: "10px 0 4px" }}>{f.fileName ?? f.name}</b>
            <p style={{ color: "#CBD6E4", fontSize: 13, margin: "0 0 16px" }}>This type can&apos;t be previewed here. Download it to open.</p>
            {f.downloadUrl && <a href={f.downloadUrl} className="rel sm">Download</a>}
          </div>
        )}
        {items.length > 1 && (
          <>
            <button type="button" onClick={() => onChange((index - 1 + items.length) % items.length)} aria-label="Previous" style={navBtn({ left: 12 })}>‹</button>
            <button type="button" onClick={() => onChange((index + 1) % items.length)} aria-label="Next" style={navBtn({ right: 12 })}>›</button>
          </>
        )}
      </div>

      <aside onClick={(e) => e.stopPropagation()} style={{ background: "#0F1C2E", borderLeft: "1px solid rgba(255,255,255,.08)", padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            {renaming ? (
              <form onSubmit={(e) => { e.preventDefault(); if (onRename) void run("rename", async () => { await onRename(f, name); setRenaming(false); }); }} style={{ display: "flex", gap: 6 }}>
                <input value={name} onChange={(e) => setName(e.target.value)} autoFocus style={{ flex: 1, minHeight: 36, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.08)", color: "#fff", fontFamily: "inherit" }} />
                <button type="submit" className="rel sm" disabled={busy !== null}>Save</button>
              </form>
            ) : (
              <>
                <b style={{ fontSize: 15, display: "block", wordBreak: "break-word" }}>{f.name || (f.kind === "photo" ? "Photo" : f.fileName)}</b>
                {f.fileName && f.fileName !== f.name && <small style={{ color: "#8FA0B4", wordBreak: "break-all" }}>{f.fileName}</small>}
              </>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.12)", color: "#fff", cursor: "pointer", flex: "none" }}>✕</button>
        </div>

        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", margin: 0, fontSize: 12.5 }}>
          <dt style={dt}>Kind</dt><dd style={dd}>{f.kind === "photo" ? "Photo" : "Document"}{f.isCover ? " · cover" : ""}</dd>
          <dt style={dt}>Type</dt><dd style={dd}>{f.mimeType ?? "—"}{f.size ? ` · ${formatBytes(f.size)}` : ""}</dd>
          <dt style={dt}>Filed by</dt><dd style={dd}>{f.uploadedBy ?? "—"}</dd>
          <dt style={dt}>When</dt><dd style={dd}>{formatDateTime(f.createdAt)}</dd>
          {f.expiresOn && <><dt style={dt}>Expires</dt><dd style={dd}>{f.expiresOn}</dd></>}
          {f.sha256 && (
            <><dt style={dt}>SHA-256</dt><dd style={{ ...dd, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, wordBreak: "break-all", cursor: "copy" }} title="Click to copy — the fingerprint of this exact file, as recorded in the audit trail" onClick={() => navigator.clipboard?.writeText(f.sha256!).catch(() => {})}>{f.sha256}</dd></>
          )}
        </dl>
        <p style={{ margin: 0, fontSize: 11.5, color: "#8FA0B4" }}>The fingerprint lets anyone prove this is the same file that was filed on that date — no trust required.</p>

        <div style={{ display: "grid", gap: 8 }}>
          {f.downloadUrl && <a href={f.downloadUrl} className="btn ghost sm" style={lightBtn}>⬇ Download</a>}
          <div style={{ display: "flex", gap: 6 }}>
            <select value={shareDays} onChange={(e) => setShareDays(Number(e.target.value))} style={{ ...sel }} aria-label="Link lasts">
              <option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
            </select>
            <button type="button" className="btn ghost sm" style={{ ...lightBtn, flex: 1 }} disabled={shareBusy || !f.blobId} onClick={() => void share()}>{shareBusy ? "Creating…" : "🔗 Share link"}</button>
          </div>
          {shareUrl && (
            <div style={{ background: "rgba(255,255,255,.06)", borderRadius: 8, padding: 10, fontSize: 12 }}>
              <div style={{ color: copied ? "#7EDBA4" : "#CBD6E4", marginBottom: 4 }}>{copied ? "Copied — paste it into an email or WhatsApp." : "Your link:"}</div>
              <code style={{ wordBreak: "break-all", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, userSelect: "all" }}>{shareUrl}</code>
              <div style={{ color: "#8FA0B4", marginTop: 4 }}>Works for {shareDays} day{shareDays === 1 ? "" : "s"}, no account needed. Opens are counted; revoke it from the Files page.</div>
            </div>
          )}
          {canEdit && f.kind === "photo" && !f.isCover && onCover && <button type="button" className="btn ghost sm" style={lightBtn} disabled={busy !== null} onClick={() => void run("cover", () => onCover(f))}>{busy === "cover" ? "…" : "★ Make cover photo"}</button>}
          {canEdit && onRename && !renaming && <button type="button" className="btn ghost sm" style={lightBtn} onClick={() => setRenaming(true)}>✎ {f.kind === "photo" ? "Caption" : "Change type"}</button>}
          {canEdit && onRemove && <button type="button" className="btn ghost sm" style={{ ...lightBtn, color: "#FFB4A8" }} disabled={busy !== null} onClick={() => { if (window.confirm("Remove this file? The audit trail keeps a record of the removal.")) void run("remove", () => onRemove(f)); }}>{busy === "remove" ? "Removing…" : "🗑 Remove"}</button>}
          {error && <p style={{ margin: 0, color: "#FFB4A8", fontSize: 12.5 }}>{error}</p>}
        </div>
        {items.length > 1 && <p style={{ margin: "auto 0 0", color: "#8FA0B4", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{index + 1} / {items.length} · ← → to move</p>}
      </aside>
      <style jsx global>{`@media (max-width: 760px) { .fv { grid-template-columns: 1fr !important; grid-template-rows: minmax(0, 1fr) auto; } .fv aside { max-height: 46vh; } }`}</style>
    </div>,
    document.body,
  );
}

const navBtn = (pos: { left?: number; right?: number }): React.CSSProperties => ({ position: "absolute", top: "50%", transform: "translateY(-50%)", ...pos, width: 44, height: 44, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.14)", color: "#fff", fontSize: 26, cursor: "pointer", lineHeight: "44px" });
const dt: React.CSSProperties = { color: "#8FA0B4", margin: 0 };
const dd: React.CSSProperties = { margin: 0, color: "#fff" };
const lightBtn: React.CSSProperties = { color: "#fff", borderColor: "rgba(255,255,255,.3)", background: "transparent", justifyContent: "center", display: "inline-flex", textDecoration: "none" };
const sel: React.CSSProperties = { minHeight: 36, padding: "4px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,.3)", background: "#0F1C2E", color: "#fff", fontFamily: "inherit", fontSize: 12.5 };
