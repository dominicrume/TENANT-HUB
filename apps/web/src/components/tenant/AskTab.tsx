/**
 * AskTab — ask about this tenant. Read-only: the model proposes, never writes (H2),
 * and every claim in the answer is tied to a source fact by hash.
 * Folded in from the AI Brain page (BUILD_PLAN C05): a question is about a person,
 * so it lives on the person's record. No provider picker — the server chooses.
 */
"use client";

import { useEffect, useState } from "react";

const CHIPS = ["Summarise the last month", "Anything I should be worried about?", "Draft this month's council report", "What's outstanding on the record?"];

export function AskTab({ tenantId }: { tenantId: string }) {
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [claims, setClaims] = useState<{ claim: string; factHash: string }[]>([]);
  const [factMap, setFactMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setQuestions(null);
    fetch(`/api/ai/questions?tenantId=${tenantId}`).then((r) => (r.ok ? r.json() : [])).then((d) => setQuestions(Array.isArray(d) ? d : [])).catch(() => setQuestions([]));
  }, [tenantId]);

  async function ask() {
    setBusy(true); setAnswer(null); setClaims([]); setFactMap({});
    const res = await fetch("/api/ai/task", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId, prompt }) });
    const b = await res.json().catch(() => null);
    if (res.status === 422 && b?.error) {
      setAnswer(`This answer was held back because it couldn't be traced to the record.\n\n${String(b.error).replace("Grounding Verification Failed: ", "")}`);
    } else {
      setAnswer(b?.response ?? b?.error ?? "No answer came back.");
      if (b?.claims) setClaims(b.claims);
      if (b?.factMap) setFactMap(b.factMap);
    }
    setBusy(false);
  }

  return (
    <div style={{ marginTop: 20, display: "grid", gap: 14, maxWidth: 760 }}>
      <div className="card" style={{ padding: 16 }}>
        <h3 style={h3}>Questions to ask at the next session</h3>
        {questions === null ? <p className="muted">Thinking…</p>
          : questions.length === 0 ? <p className="muted">Nothing suggested yet. Log a session and come back.</p>
          : <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{questions.map((q, i) => <span key={i} style={chip}>{q}</span>)}</div>}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h3 style={h3}>Ask about this tenant</h3>
        <p className="muted" style={{ margin: "0 0 10px" }}>Reads the record only. It can suggest; it cannot change anything.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {CHIPS.map((c) => <button key={c} type="button" onClick={() => setPrompt(c)} style={chipBtn}>{c}</button>)}
        </div>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask in your own words…" style={ta} />
        <button type="button" className="rel" onClick={ask} disabled={busy || !prompt.trim()} style={{ marginTop: 10 }}>{busy ? "Working…" : "Ask"}</button>
        {answer && (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5, color: "var(--ink)", background: "rgba(107,91,209,.05)", border: "1px solid rgba(107,91,209,.18)", borderRadius: 10, padding: 12 }}>{answer}</div>
            {claims.length > 0 && (
              <div className="why" style={{ margin: 0 }}>
                <h4>Where each claim comes from</h4>
                <ul>{claims.map((c, i) => (
                  <li key={i}>&ldquo;{c.claim}&rdquo; <span className="mono" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "var(--violet)" }}>{c.factHash}</span>
                    {factMap[c.factHash] ? <> — from &ldquo;{factMap[c.factHash]}&rdquo;</> : " — source not found"}</li>))}</ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const h3: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: "var(--navy)", margin: "0 0 8px" };
const chip: React.CSSProperties = { background: "rgba(107,91,209,.07)", border: "1px solid rgba(107,91,209,.25)", color: "var(--violet)", borderRadius: 20, padding: "6px 12px", fontSize: 12.5 };
const chipBtn: React.CSSProperties = { background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 16, padding: "7px 11px", fontSize: 12, color: "var(--slate)", cursor: "pointer", fontFamily: "inherit", minHeight: 36 };
const ta: React.CSSProperties = { width: "100%", minHeight: 80, padding: 10, borderRadius: 10, border: "1px solid var(--line)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box", resize: "vertical" };
