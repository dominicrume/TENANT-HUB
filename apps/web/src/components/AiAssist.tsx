"use client";

import { useState } from "react";

type Purpose = "handover" | "incident" | "session" | "staff_note";

/**
 * The writing assistant under every free-text box — our own AI brain, not a
 * browser extension. Three verbs: draft it from rough notes, tidy what's
 * there, shorten it. The result replaces the box's text; nothing is saved
 * until the person posts it under their own name, and the note underneath
 * says so. Never invents facts (the server prompt forbids it) — but a human
 * still reads it before it goes anywhere.
 */
export function AiAssist({ purpose, value, onChange, context }: { purpose: Purpose; value: string; onChange: (v: string) => void; context?: Record<string, string> }) {
  const [busy, setBusy] = useState<"draft" | "tidy" | "shorten" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wroteWithAi, setWroteWithAi] = useState(false);

  async function run(action: "draft" | "tidy" | "shorten") {
    setBusy(action); setError(null);
    try {
      const res = await fetch("/api/ai/assist", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, action, text: value, context }),
      });
      const j = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
      if (!res.ok || !j?.text) throw new Error(j?.error ?? "The assistant couldn't write that just now");
      onChange(j.text);
      setWroteWithAi(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The assistant couldn't write that just now");
    } finally {
      setBusy(null);
    }
  }

  const empty = !value.trim();
  const btn = (action: "draft" | "tidy" | "shorten", label: string, title: string) => (
    <button type="button" className="btn ghost sm" disabled={busy !== null || empty} title={empty ? "Type a few words first — even bullet points" : title} onClick={() => void run(action)}>
      {busy === action ? "Writing…" : label}
    </button>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: -4 }}>
      <span style={{ fontSize: 12, color: "var(--slate-2)", fontWeight: 600 }}>✨ Help me write</span>
      {btn("draft", "Draft from my notes", "Turn rough notes or bullet points into the full note")}
      {btn("tidy", "Tidy up", "Fix grammar and flow — keeps every fact exactly as typed")}
      {btn("shorten", "Shorten", "Keep what matters to the next person, drop the padding")}
      {wroteWithAi && !error && <span style={{ fontSize: 12, color: "var(--amber-deep)" }}>Written with AI — read it before you post it.</span>}
      {error && <span style={{ fontSize: 12, color: "var(--brick)" }}>{error}</span>}
    </div>
  );
}
