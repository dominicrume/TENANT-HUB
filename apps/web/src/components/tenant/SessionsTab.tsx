/**
 * SessionsTab — AI Brain question panel, new-session entry (with optional
 * voice-to-text), and chronological session history. Writes via POST
 * /api/sessions (writeWithAudit, H1).
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SessionType } from "@tenant-hub/validation";
import { AiAssist } from "../AiAssist";
import { formatShortDate, truncateHash } from "../../lib/format";
import { downloadSessionAsWord, printSession } from "../../lib/session-export";
import { DigitalSignaturePad } from "../form/DigitalSignaturePad";
import { useAuth } from "../../contexts/AuthContext";

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
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};

export function SessionsTab({ tenantId, tenantName }: { tenantId: string; tenantName?: string }) {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  // The session just saved: both people sign under it straight away (Matloob, 2026-10-15).
  const [signing, setSigning] = useState<Session | null>(null);
  const [interim, setInterim] = useState("");
  const baseNotesRef = useRef("");
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
    // Live: the words land in the box as they're spoken (grey while the engine is still deciding,
    // black once final) — "the text should be typing out in real time" (Rume, 2026-10-15).
    rec.interimResults = true;
    baseNotesRef.current = notes.trim();
    rec.onresult = (e) => {
      let finals = ""; let pending = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]; const t = r?.[0]?.transcript ?? "";
        if (r?.isFinal) finals += t; else pending += t;
      }
      const base = baseNotesRef.current;
      setNotes(`${base}${base && finals ? " " : ""}${finals.trim()}`);
      setInterim(pending.trim());
    };
    rec.onerror = () => { setListening(false); setInterim(""); };
    rec.onend = () => { setListening(false); setInterim(""); };
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  async function sign(sessionId: string, body: { worker_signature?: string; tenant_signature?: string }) {
    const res = await fetch(`/api/sessions/${sessionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { const b = await res.json().catch(() => null); setMsg(`✗ ${b?.error ?? "Could not sign"}`); return; }
    const updated = (await res.json()) as Session;
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
    setSigning((cur) => (cur && cur.id === updated.id ? { ...cur, ...updated } : cur));
  }

  const mailto = (s: Session) => `mailto:?subject=${encodeURIComponent(`Support session · ${tenantName ?? "tenant"} · ${formatShortDate(s.session_date)}`)}&body=${encodeURIComponent(`${s.session_type.toUpperCase()} session · ${formatShortDate(s.session_date)} · logged by ${s.entered_by_name ?? "—"}\n\n${s.notes}\n\nSigned: support worker ${s.worker_signed_at ? "✓" : "—"} · tenant ${s.tenant_signed_at ? "✓" : "—"}\n\nSent from Tenant Hub.`)}`;

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
    const created = await res.json().catch(() => null);
    const row = (Array.isArray(created) ? created[0] : created) as Session | null;
    setMsg("✓ Session saved — now both of you sign it off below");
    setNotes(""); setInterim("");
    await load();
    if (row?.id) setSigning(row);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* AI BRAIN */}
      <div style={{ ...card, border: "1px solid var(--amber)", background: "#FFFBF4" }}>
        <h3 style={{ color: "var(--navy)", fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}>
          ✨ AI Brain: questions from the last session
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
        <div style={{ position: "relative" }}>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); baseNotesRef.current = e.target.value.trim(); }}
            placeholder={listening ? "Listening — speak, and the words appear here as you talk…" : "Session notes… or press 🎤 and just talk"}
            style={{ width: "100%", minHeight: "120px", padding: "11px", borderRadius: "8px", border: `1px solid ${listening ? "#E05252" : "#EDE8E1"}`, fontFamily: "'Sora',sans-serif", fontSize: "14px", boxSizing: "border-box", resize: "vertical", boxShadow: listening ? "0 0 0 3px rgba(224,82,82,.12)" : undefined }}
          />
          {listening && interim && <div aria-live="polite" style={{ position: "absolute", left: 12, right: 12, bottom: 10, fontSize: 13.5, color: "#8A93A0", fontStyle: "italic", pointerEvents: "none", background: "rgba(255,255,255,.85)", padding: "2px 4px", borderRadius: 4 }}>{interim}…</div>}
        </div>
        <AiAssist purpose="session" value={notes} onChange={setNotes} />
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
            {listening ? <><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#E05252", marginRight: 6, animation: "jdpulse 1.2s ease-out infinite" }} />Stop</> : "🎤 Voice"}
          </button>
          {!voiceSupported && <span style={{ fontSize: "12px", color: "#7A8499" }}>Voice not supported in this browser.</span>}
          {msg && <span style={{ fontSize: "13px", color: msg.startsWith("✓") ? "#1E7F4F" : "#E05252" }}>{msg}</span>}
        </div>
      </div>

      {/* SIGN-OFF — appears underneath the moment a session is saved: the support worker's line and the tenant's. */}
      {signing && (
        <SignOff s={signing} workerName={profile?.full_name ?? signing.entered_by_name ?? "Support worker"} tenantName={tenantName ?? "Tenant"} onSign={(b) => void sign(signing.id, b)} onClose={() => setSigning(null)} />
      )}

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
                    <span style={{ background: "rgba(124,58,237,0.1)", color: "#7C3AED", borderRadius: "5px", padding: "2px 7px", fontFamily: "'JetBrains Mono',monospace", fontSize: "10px" }}>
                      ⛓ {truncateHash(s.blockchain_hash)}
                    </span>
                  )}
                  <span style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
                    <button type="button" onClick={() => downloadSessionAsWord(s)} title="Download as Word" style={{ background: "none", border: "1px solid #EDE8E1", borderRadius: "5px", padding: "2px 8px", fontSize: "11px", color: "#5C6673", cursor: "pointer" }}>Word</button>
                    <button type="button" onClick={() => printSession(s)} title="Print or save as PDF" style={{ background: "none", border: "1px solid #EDE8E1", borderRadius: "5px", padding: "2px 8px", fontSize: "11px", color: "#5C6673", cursor: "pointer" }}>PDF</button>
                    <a href={mailto(s)} title="Open in your email app with the note in the body" style={{ background: "none", border: "1px solid #EDE8E1", borderRadius: "5px", padding: "2px 8px", fontSize: "11px", color: "#5C6673", textDecoration: "none" }}>Email</a>
                  </span>
                </div>
                <div style={{ fontSize: "13px", color: "#334", whiteSpace: "pre-wrap" }}>{s.notes}</div>
                <div style={{ display: "flex", gap: 18, marginTop: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <Sig label={`Support worker · ${s.entered_by_name ?? ""}`} src={s.worker_signature ?? null} at={s.worker_signed_at ?? null} />
                  <Sig label={`Tenant · ${tenantName ?? ""}`} src={s.tenant_signature ?? null} at={s.tenant_signed_at ?? null} />
                  {(!s.worker_signature || !s.tenant_signature) && signing?.id !== s.id && (
                    <button type="button" className="rel sm" onClick={() => setSigning(s)}>Sign off</button>
                  )}
                </div>
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

function Sig({ label, src, at }: { label: string; src: string | null; at: string | null }) {
  return (
    <div style={{ minWidth: 170 }}>
      <div style={{ fontSize: 10, color: "#7A8499", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="signature" style={{ height: 36, display: "block" }} />
      ) : <div style={{ height: 36, borderBottom: "1px dotted #CBD2DB", width: 160 }} />}
      <div style={{ fontSize: 10.5, color: at ? "#1E7F4F" : "#B24A31" }}>{at ? `signed ${formatShortDate(at)}` : "not signed"}</div>
    </div>
  );
}

/** Two lines under the note — the support worker signs, then hands the pad to the tenant. Each signature saves the moment it's given. */
function SignOff({ s, workerName, tenantName, onSign, onClose }: { s: Session; workerName: string; tenantName: string; onSign: (b: { worker_signature?: string; tenant_signature?: string }) => void; onClose: () => void }) {
  const both = !!s.worker_signature && !!s.tenant_signature;
  return (
    <div style={{ ...card, border: "1px solid var(--amber)", background: "#FFFBF4" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <h3 style={{ color: "var(--navy)", fontSize: 14, fontWeight: 700, margin: 0 }}>Sign off · {s.session_type} session · {formatShortDate(s.session_date)}</h3>
        <button type="button" className="btn ghost sm" onClick={onClose}>{both ? "Done" : "Later"}</button>
      </div>
      <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "#7A8499" }}>Both people in the room sign under the note — it prints on the monthly report exactly like this.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div>
          {s.worker_signature ? <Sig label={`Support worker · ${workerName}`} src={s.worker_signature} at={s.worker_signed_at ?? null} />
            : <DigitalSignaturePad label={`Support worker · ${workerName}`} value="" onChange={(b64) => { if (b64) onSign({ worker_signature: b64 }); }} />}
        </div>
        <div>
          {s.tenant_signature ? <Sig label={`Tenant · ${tenantName}`} src={s.tenant_signature} at={s.tenant_signed_at ?? null} />
            : <DigitalSignaturePad label={`Tenant · ${tenantName}`} value="" onChange={(b64) => { if (b64) onSign({ tenant_signature: b64 }); }} />}
        </div>
      </div>
      {both && <p style={{ margin: "10px 0 0", fontSize: 13, color: "#1E7F4F", fontWeight: 600 }}>✓ Signed by both. It&apos;s on the record.</p>}
    </div>
  );
}
