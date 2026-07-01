/**
 * SessionsTab — AI Brain question panel, new-session entry (with optional
 * voice-to-text), and chronological session history. Writes via POST
 * /api/sessions (writeWithAudit, H1).
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SessionType } from "@tenant-hub/validation";
import { formatShortDate, truncateHash } from "../../lib/format";

const TYPE_BORDER: Record<string, string> = {
  daily: "#E8A84C",
  weekly: "#0FB5A6",
  monthly: "#0F1C2E",
};

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid #EDE8E1",
  borderRadius: "12px",
  padding: "16px",
};

// Minimal typing for the (vendor-prefixed) Web Speech API.
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
};

export function SessionsTab({ tenantId }: { tenantId: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [type, setType] = useState<SessionType>("weekly");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [viewMode, setViewMode] = useState<"history" | "quarterly">("history");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/sessions?tenantId=${tenantId}`);
    if (res.ok) setSessions((await res.json()) as Session[]);
  }, [tenantId]);

  useEffect(() => {
    setDate(new Date().toISOString().slice(0, 10));
    void load();
  }, [load]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/ai/questions?tenantId=${tenantId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => alive && setQuestions(Array.isArray(d) ? d : []))
      .catch(() => alive && setQuestions([]));
    return () => {
      alive = false;
    };
  }, [tenantId]);

  const voiceSupported =
    typeof window !== "undefined" &&
    ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

  function toggleVoice() {
    if (!voiceSupported) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor =
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike; SpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition ??
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-GB";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i]?.[0]?.transcript ?? "";
      setNotes((prev) => (prev ? `${prev} ${text}` : text));
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: tenantId, session_type: type, session_date: date, notes }),
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setMsg(`✗ ${b?.error ?? "Save failed"}`);
      return;
    }
    setMsg("✓ Session saved");
    setNotes("");
    await load();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* AI BRAIN */}
      <div style={{ ...card, border: "1px solid var(--amber)", background: "#FFFBF4" }}>
        <h3 style={{ color: "var(--navy)", fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}>
          ✨ AI Brain — questions from the last session
        </h3>
        {questions === null ? (
          <div style={{ color: "#7A8499", fontSize: "13px" }}>Thinking…</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {questions.map((q, i) => (
              <button
                key={i}
                onClick={() => setNotes((p) => (p ? `${p}\n${q} ` : `${q} `))}
                style={{
                  background: "#fff", border: "1px solid var(--amber)", borderRadius: "20px",
                  padding: "6px 12px", fontSize: "12px", color: "var(--navy)", cursor: "pointer",
                  fontFamily: "'Sora',sans-serif", textAlign: "left",
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* NEW SESSION */}
      <div style={card}>
        <h3 style={{ color: "var(--navy)", fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>
          New session
        </h3>
        <div style={{ display: "flex", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
          <select value={type} onChange={(e) => setType(e.target.value as SessionType)}
            style={{ minHeight: "44px", padding: "8px 11px", borderRadius: "8px", border: "1px solid #EDE8E1", fontFamily: "'Sora',sans-serif" }}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={{ minHeight: "44px", padding: "8px 11px", borderRadius: "8px", border: "1px solid #EDE8E1", fontFamily: "'Sora',sans-serif" }} />
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Session notes…"
          style={{ width: "100%", minHeight: "120px", padding: "11px", borderRadius: "8px", border: "1px solid #EDE8E1", fontFamily: "'Sora',sans-serif", fontSize: "14px", boxSizing: "border-box", resize: "vertical" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px" }}>
          <button
            onClick={save}
            disabled={saving || !notes.trim()}
            style={{ minHeight: "44px", padding: "0 20px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", fontWeight: 600, fontSize: "13px", cursor: saving || !notes.trim() ? "not-allowed" : "pointer", fontFamily: "'Sora',sans-serif" }}
          >
            {saving ? "Saving…" : "Save Session"}
          </button>
          <button
            onClick={toggleVoice}
            title={voiceSupported ? "Voice to text" : "Voice not supported in this browser"}
            disabled={!voiceSupported}
            style={{ minHeight: "44px", padding: "0 14px", borderRadius: "8px", border: "1px solid #EDE8E1", background: listening ? "rgba(224,82,82,0.1)" : "#fff", color: listening ? "#E05252" : "#7A8499", cursor: voiceSupported ? "pointer" : "not-allowed", fontSize: "13px" }}
          >
            🎤 {listening ? "Listening…" : "Voice"}
          </button>
          {!voiceSupported && <span style={{ fontSize: "12px", color: "#7A8499" }}>Voice not supported in this browser.</span>}
          {msg && <span style={{ fontSize: "13px", color: msg.startsWith("✓") ? "#1E7F4F" : "#E05252" }}>{msg}</span>}
        </div>
      </div>

      {/* HISTORY & QUARTERLY TOGGLE */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <h3 style={{ color: "var(--navy)", fontSize: "14px", fontWeight: 700, margin: 0 }}>History</h3>
          <div style={{ display: "flex", background: "#f3f4f6", borderRadius: "8px", padding: "4px" }}>
            <button 
              onClick={() => setViewMode("history")}
              style={{ padding: "6px 12px", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", background: viewMode === "history" ? "#fff" : "transparent", color: viewMode === "history" ? "var(--navy)" : "#6b7280", boxShadow: viewMode === "history" ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}
            >
              Chronological
            </button>
            <button 
              onClick={() => setViewMode("quarterly")}
              style={{ padding: "6px 12px", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", background: viewMode === "quarterly" ? "#fff" : "transparent", color: viewMode === "quarterly" ? "var(--navy)" : "#6b7280", boxShadow: viewMode === "quarterly" ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}
            >
              Quarterly Summary
            </button>
          </div>
        </div>
        {sessions.length === 0 ? (
          <p style={{ color: "#7A8499", fontSize: "13px" }}>No sessions yet. Log the first one.</p>
        ) : viewMode === "history" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {sessions.map((s) => (
              <div key={s.id} style={{ ...card, borderLeft: `4px solid ${TYPE_BORDER[s.session_type] ?? "#7A8499"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px", fontSize: "12px" }}>
                  <span style={{ textTransform: "uppercase", fontWeight: 700, color: "var(--navy)", letterSpacing: "0.04em" }}>{s.session_type}</span>
                  <span style={{ color: "#7A8499" }}>{formatShortDate(s.session_date)}</span>
                  <span style={{ color: "#9AA6BC", fontFamily: "'JetBrains Mono',monospace" }}>Logged by: {s.entered_by_name ?? "—"}</span>
                  {s.blockchain_hash && (
                    <span style={{ marginLeft: "auto", background: "rgba(124,58,237,0.1)", color: "#7C3AED", borderRadius: "5px", padding: "2px 7px", fontFamily: "'JetBrains Mono',monospace", fontSize: "10px" }}>
                      ⛓ {truncateHash(s.blockchain_hash)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "13px", color: "#334", whiteSpace: "pre-wrap" }}>{s.notes}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {Object.entries(sessions.reduce((acc, s) => {
              const d = new Date(s.session_date);
              const q = Math.floor(d.getMonth() / 3) + 1;
              const y = d.getFullYear();
              const key = `Q${q} ${y}`;
              if (!acc[key]) acc[key] = { sessions: 0, daily: 0, weekly: 0, monthly: 0, notes: [] };
              acc[key].sessions++;
              acc[key][s.session_type]++;
              if (s.notes) acc[key].notes.push(`- [${formatShortDate(s.session_date)}] ${s.notes}`);
              return acc;
            }, {} as Record<string, any>)).map(([quarter, stats]: [string, any]) => (
              <div key={quarter} style={{ ...card, borderTop: "4px solid var(--navy)" }}>
                <h4 style={{ margin: "0 0 12px 0", color: "var(--navy)", fontSize: "15px", fontWeight: 700 }}>{quarter} Summary</h4>
                <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
                  <div style={{ background: "#f8fafc", padding: "10px", borderRadius: "8px", flex: 1 }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Total Sessions</div>
                    <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--navy)" }}>{stats.sessions}</div>
                  </div>
                  <div style={{ background: "#fffbeb", padding: "10px", borderRadius: "8px", flex: 1 }}>
                    <div style={{ fontSize: "11px", color: "#b45309", textTransform: "uppercase", fontWeight: 600 }}>Daily Logs</div>
                    <div style={{ fontSize: "20px", fontWeight: 700, color: "#92400e" }}>{stats.daily}</div>
                  </div>
                  <div style={{ background: "#f0fdfa", padding: "10px", borderRadius: "8px", flex: 1 }}>
                    <div style={{ fontSize: "11px", color: "#0f766e", textTransform: "uppercase", fontWeight: 600 }}>Weekly Logs</div>
                    <div style={{ fontSize: "20px", fontWeight: 700, color: "#115e59" }}>{stats.weekly}</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--navy)", marginBottom: "8px" }}>Aggregated Notes:</div>
                  <div style={{ fontSize: "13px", color: "#475569", background: "#f1f5f9", padding: "12px", borderRadius: "8px", maxHeight: "200px", overflowY: "auto", whiteSpace: "pre-wrap" }}>
                    {stats.notes.join("\n\n")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
