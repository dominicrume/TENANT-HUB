/**
 * Step 1 — Input selection. Three modes; creating a draft persists to the DB
 * (H5: draftId lives in the URL, never localStorage). Manual jumps straight to
 * review; OCR goes via extraction; voice is Sprint 5.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InputMode } from "../../../../lib/intake";

const CARD: React.CSSProperties = {
  minHeight: "120px", flex: "1 1 200px", borderRadius: "12px", border: "1px solid #EDE8E1",
  background: "#fff", padding: "18px", cursor: "pointer", textAlign: "left",
  display: "flex", flexDirection: "column", gap: "6px", fontFamily: "'Sora',sans-serif",
};

export default function IntakeNewPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(mode: "manual" | "ocr" | "voice") {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input_mode: mode }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setError(b?.error ?? "Could not start intake");
      setBusy(false);
      return;
    }
    const draft = await res.json();
    if (mode === "voice") {
      router.push(`/intake/${draft.id}/voice`);
    } else {
      router.push(mode === "ocr" ? `/intake/${draft.id}/extract` : `/intake/${draft.id}/review`);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--navy)", marginBottom: "16px" }}>
        How would you like to add this tenant?
      </h1>
      {error && <div style={{ color: "#E05252", fontSize: "13px", marginBottom: "12px" }}>{error}</div>}

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <button style={CARD} onClick={() => start("manual")} disabled={busy}>
          <span style={{ fontSize: "26px" }}>⌨️</span>
          <strong style={{ color: "var(--navy)" }}>Manual Entry</strong>
          <span style={{ fontSize: "12px", color: "#7A8499" }}>Type details directly. Fastest for staff who know the tenant.</span>
        </button>

        <button style={CARD} onClick={() => start("ocr")} disabled={busy}>
          <span style={{ fontSize: "26px" }}>📄</span>
          <strong style={{ color: "var(--navy)" }}>Upload &amp; OCR</strong>
          <span style={{ fontSize: "12px", color: "#7A8499" }}>Upload a physical Ash Shahada form. Fields extracted automatically.</span>
        </button>

        <button style={CARD} onClick={() => start("voice")} disabled={busy}>
          <span style={{ fontSize: "26px" }}>🎤</span>
          <strong style={{ color: "var(--navy)" }}>Voice Input</strong>
          <span style={{ fontSize: "12px", color: "#7A8499" }}>Speak the details aloud. AI will transcribe and extract.</span>
        </button>
      </div>
    </div>
  );
}
