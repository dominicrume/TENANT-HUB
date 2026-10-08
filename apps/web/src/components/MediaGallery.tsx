"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { compressImage } from "../lib/compress-image";

interface MediaItem { id: string; caption: string | null; uploadedBy: string; createdAt: string; url: string }

/** Photo gallery for a property or a room — same component, different owner. */
export function MediaGallery({ entityType, entityId, title = "Media" }: { entityType: "property" | "unit"; entityId: string; title?: string }) {
  const base = entityType === "property" ? `/api/properties/${entityId}/media` : `/api/units/${entityId}/media`;
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(base);
    if (res.ok) setItems(await res.json());
  }, [base]);

  useEffect(() => { void load(); }, [load]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const compressed = await compressImage(file);
      const form = new FormData();
      form.append("file", compressed);
      const res = await fetch(base, { method: "POST", body: form });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error ?? "Could not upload that photo");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    try {
      await fetch(`/api/media/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section className="card" style={{ marginBottom: 18 }}>
      <div className="ch" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <button type="button" className="btn ghost sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? "Uploading…" : "+ Add photo"}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
      </div>

      {error && <p style={{ color: "var(--brick)", fontSize: 13, padding: "0 16px" }}>{error}</p>}

      {items === null ? (
        <div className="li"><p className="muted">Loading…</p></div>
      ) : items.length === 0 ? (
        <div className="li"><p className="muted">No photos yet.</p></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10, padding: "0 16px 16px" }}>
          {items.map((it) => (
            <div key={it.id} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", background: "#F0EEE9" }}>
              <a href={it.url} target="_blank" rel="noreferrer">
                <Image src={it.url} alt={it.caption ?? "Photo"} fill sizes="110px" style={{ objectFit: "cover" }} />
              </a>
              <button
                type="button"
                onClick={() => void handleRemove(it.id)}
                disabled={removingId === it.id}
                title="Remove photo"
                style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", border: "none", background: "rgba(15,28,46,0.72)", color: "#fff", fontSize: 12, cursor: "pointer", lineHeight: "22px" }}
              >
                {removingId === it.id ? "…" : "✕"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
