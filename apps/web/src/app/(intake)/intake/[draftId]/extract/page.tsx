/**
 * Step 2 — OCR extraction. Upload a form image (preview) and/or paste the form
 * text; the AI returns structured fields, editable on the right with confidence
 * cues. Confirm persists to the draft (step 2) and advances to review.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RecordFields } from "../../../../../components/intake/RecordFields";
import type { Draft } from "../../../../../lib/intake";

export default function ExtractPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const router = useRouter();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [confidence, setConfidence] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const loadDraft = useCallback(async () => {
    const res = await fetch(`/api/drafts/${draftId}`, { cache: "no-store" });
    if (res.ok) {
      const d = (await res.json()) as Draft;
      setData((d.machine_state?.extracted as Record<string, unknown>) ?? {});
    }
  }, [draftId]);

  useEffect(() => {
    void loadDraft();
  }, [loadDraft]);

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setImageUrl(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function extract() {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/intake/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: rawText, image: imageUrl }),
    });
    const body = await res.json();
    setData((prev) => ({ ...prev, ...(body.extracted ?? {}) }));
    setConfidence(body.confidence ?? {});
    if (body.note) setNote(body.note);
    setBusy(false);
  }

  async function confirm() {
    setBusy(true);
    const res = await fetch(`/api/drafts/${draftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machine_state: { input_mode: "ocr", extracted: data }, step: 2 }),
    });
    
    if (!res.ok) {
      setNote("Failed to save draft. Please try again.");
      setBusy(false);
      return;
    }
    
    router.push(`/intake/${draftId}/review`);
  }

  return (
    <div>
      <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--navy)", marginBottom: "16px" }}>Extract from form</h1>

      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        {/* Left — upload + paste */}
        <div style={{ flex: "1 1 280px" }}>
          <label style={{ display: "block", border: "2px dashed #D9D2C7", borderRadius: "12px", padding: "20px", textAlign: "center", cursor: "pointer", color: "#7A8499", fontSize: "13px" }}>
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="Uploaded form" style={{ maxWidth: "100%", borderRadius: "8px" }} />
            ) : (
              "📄 Click to upload a form image"
            )}
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <textarea
            placeholder="Or paste the form text here, then Extract…"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            style={{ width: "100%", minHeight: "120px", marginTop: "10px", padding: "10px", borderRadius: "8px", border: "1px solid #EDE8E1", fontFamily: "'Sora',sans-serif", fontSize: "13px", boxSizing: "border-box" }}
          />
          <button onClick={extract} disabled={busy || (!rawText.trim() && !imageUrl)}
            style={{ marginTop: "10px", minHeight: "44px", padding: "0 18px", borderRadius: "8px", border: "1px solid #EDE8E1", background: "#fff", color: "var(--navy)", fontWeight: 600, cursor: (busy || (!rawText.trim() && !imageUrl)) ? "not-allowed" : "pointer" }}>
            {busy ? "Extracting…" : "Extract fields"}
          </button>
          {note && <p style={{ fontSize: "12px", color: "#7A8499", marginTop: "8px" }}>{note}</p>}
        </div>

        {/* Right — editable fields */}
        <div style={{ flex: "2 1 380px" }}>
          <RecordFields data={data} confidence={confidence} onChange={(k, v) => setData((d) => ({ ...d, [k]: v }))} />
        </div>
      </div>

      <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
        <button onClick={confirm} disabled={busy}
          style={{ minHeight: "56px", padding: "0 24px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          Confirm Extraction →
        </button>
      </div>
    </div>
  );
}
