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

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* VOICE PRIORITY */}
        <button style={{ ...CARD, background: "var(--navy)", color: "#fff", minHeight: "140px", border: "2px solid var(--amber)", transform: "scale(1.02)", boxShadow: "0 10px 25px rgba(15, 28, 46, 0.15)" }} onClick={() => start("voice")} disabled={busy}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span style={{ fontSize: "38px", background: "rgba(255, 255, 255, 0.1)", borderRadius: "50%", width: "70px", height: "70px", display: "flex", alignItems: "center", justifyContent: "center" }}>🎤</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <strong style={{ fontSize: "20px", color: "var(--amber)" }}>Voice Input (Recommended)</strong>
              <span style={{ fontSize: "14px", color: "#C7CFDD" }}>Speak the details aloud. Our AI will automatically transcribe your speech and extract all tenant information accurately.</span>
            </div>
          </div>
        </button>

        {/* SECONDARY OPTIONS */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button style={CARD} onClick={() => start("manual")} disabled={busy}>
            <span style={{ fontSize: "26px" }}>⌨️</span>
            <strong style={{ color: "var(--navy)" }}>Manual Entry</strong>
            <span style={{ fontSize: "12px", color: "#7A8499" }}>Type details directly. Fastest for staff who know the tenant well.</span>
          </button>

          <button style={CARD} onClick={() => start("ocr")} disabled={busy}>
            <span style={{ fontSize: "26px" }}>📄</span>
            <strong style={{ color: "var(--navy)" }}>Upload &amp; OCR</strong>
            <span style={{ fontSize: "12px", color: "#7A8499" }}>Upload a physical form. Fields are extracted automatically.</span>
          </button>
        </div>
      </div>
    </div>
  );
}
