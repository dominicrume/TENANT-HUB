/**
 * AI Brain — purple-accented assistant. Session intelligence (questions for the
 * selected tenant), open agent tasking (read-only; proposes, never writes), and
 * rule-based risk flags.
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTenants } from "../../../hooks/useTenants";

const CHAIN = "#7C3AED";
const PROMPT_CHIPS = [
  "Summarise this tenant's last month",
  "Flag any safeguarding concerns",
  "Draft a council report for this month",
  "Which tenants haven't paid this week?",
  "Generate a weekly summary for all tenants",
];

interface Flag { tenant_id: string; name: string; room: string; reason: string; severity: string }

const card: React.CSSProperties = { background: "var(--surface)", border: `1px solid ${CHAIN}33`, borderRadius: "12px", padding: "16px" };

export default function AiBrainPage() {
  const { activeTenants } = useTenants();
  const router = useRouter();
  const [tenantId, setTenantId] = useState("");
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flags, setFlags] = useState<Flag[]>([]);

  useEffect(() => {
    fetch("/api/risk-flags").then((r) => (r.ok ? r.json() : [])).then((d) => setFlags(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!tenantId) { setQuestions(null); return; }
    setQuestions(null);
    fetch(`/api/ai/questions?tenantId=${tenantId}`).then((r) => (r.ok ? r.json() : [])).then((d) => setQuestions(Array.isArray(d) ? d : [])).catch(() => setQuestions([]));
  }, [tenantId]);

  async function ask() {
    setBusy(true);
    setAnswer(null);
    const res = await fetch("/api/ai/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: tenantId || undefined, prompt }),
    });
    const b = await res.json().catch(() => null);
    setAnswer(b?.response ?? b?.error ?? "No response");
    setBusy(false);
  }

  return (
    <div style={{ padding: "1.75rem", fontFamily: "'Sora', sans-serif", maxWidth: "880px" }}>
      <h1 style={{ color: CHAIN, fontSize: "22px", fontWeight: 700, marginBottom: "4px" }}>✨ AI Brain</h1>
      <p style={{ color: "#7A8499", fontSize: "13px", marginBottom: "16px" }}>Read-only assistant — proposes, never writes (H2).</p>

      <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}
        style={{ minHeight: "44px", padding: "8px 11px", borderRadius: "8px", border: "1px solid #EDE8E1", marginBottom: "16px" }}>
        <option value="">All tenants</option>
        {activeTenants.map((t) => <option key={t.id} value={t.id}>{t.full_name} · {t.room_number}</option>)}
      </select>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* A — Session intelligence */}
        {tenantId && (
          <div style={card}>
            <h2 style={{ fontSize: "14px", fontWeight: 700, color: "var(--navy)", marginBottom: "8px" }}>Questions from the last session</h2>
            {questions === null ? <div style={{ color: "#7A8499", fontSize: "13px" }}>Thinking…</div> : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {questions.map((q, i) => (
                  <span key={i} style={{ background: `${CHAIN}11`, border: `1px solid ${CHAIN}44`, color: CHAIN, borderRadius: "20px", padding: "6px 12px", fontSize: "12px" }}>{q}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* B — Open agent tasking */}
        <div style={card}>
          <h2 style={{ fontSize: "14px", fontWeight: 700, color: "var(--navy)", marginBottom: "8px" }}>Ask the AI Brain</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
            {PROMPT_CHIPS.map((c) => (
              <button key={c} onClick={() => setPrompt(c)} style={{ background: "#F8F4EF", border: "1px solid #EDE8E1", borderRadius: "16px", padding: "5px 10px", fontSize: "11px", color: "#445", cursor: "pointer" }}>{c}</button>
            ))}
          </div>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask the AI Brain to do anything…"
            style={{ width: "100%", minHeight: "80px", padding: "10px", borderRadius: "8px", border: "1px solid #EDE8E1", fontFamily: "'Sora',sans-serif", fontSize: "14px", boxSizing: "border-box" }} />
          <button onClick={ask} disabled={busy || !prompt.trim()}
            style={{ marginTop: "10px", minHeight: "44px", padding: "0 18px", borderRadius: "8px", border: "none", background: CHAIN, color: "#fff", fontWeight: 600, cursor: busy || !prompt.trim() ? "not-allowed" : "pointer" }}>
            {busy ? "Working…" : "Ask"}
          </button>
          {answer && (
            <div style={{ marginTop: "12px", whiteSpace: "pre-wrap", fontSize: "13px", color: "#334", background: "#FBFAFF", border: `1px solid ${CHAIN}22`, borderRadius: "8px", padding: "12px" }}>
              {answer}
            </div>
          )}
        </div>

        {/* C — Risk flags */}
        <div style={card}>
          <h2 style={{ fontSize: "14px", fontWeight: 700, color: "var(--navy)", marginBottom: "8px" }}>Risk Flags</h2>
          {flags.length === 0 ? <p style={{ color: "#7A8499", fontSize: "13px" }}>No flags.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {flags.map((f) => (
                <div key={f.tenant_id} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", padding: "8px", borderRadius: "8px", background: "#F8F4EF" }}>
                  <span style={{ fontWeight: 600, color: "var(--navy)" }}>{f.name}</span>
                  <span style={{ color: "#7A8499" }}>{f.room}</span>
                  <span style={{ color: "#445", flex: 1 }}>{f.reason}</span>
                  <span style={{ fontSize: "10px", fontWeight: 700, color: f.severity === "High" ? "#E05252" : "#E8A84C" }}>{f.severity}</span>
                  <button onClick={() => router.push(`/tenants/${f.tenant_id}`)} style={{ border: "1px solid #EDE8E1", background: "#fff", borderRadius: "6px", padding: "3px 8px", fontSize: "11px", cursor: "pointer" }}>Review</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
