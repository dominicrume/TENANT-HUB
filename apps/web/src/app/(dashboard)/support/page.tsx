/**
 * Support — "support always should be there for me" (Matloob, 2026-10-14).
 * One form that reaches the people who build and run Tenant Hub, with who
 * you are and which page you were on already attached; your past messages
 * underneath; and the quick answers staff ask most.
 */
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { formatDateTime } from "../../../lib/format";
import { useAuth } from "../../../contexts/AuthContext";

interface Req { id: string; from_name: string; kind: string; subject: string; body: string; status: string; emailed: boolean; created_at: string }

const KINDS = [
  { key: "problem",  label: "Something's not working",  short: "Not working", icon: "🛠", hint: "A broken button, a save that didn't save, a photo that won't upload." },
  { key: "question", label: "How do I…?",               short: "How do I?",   icon: "❓", hint: "You know what you need; you just can't see how to do it here." },
  { key: "idea",     label: "An idea",                  short: "An idea",     icon: "💡", hint: "Something that would make a working day easier." },
  { key: "urgent",   label: "Urgent — people are stuck", short: "Urgent",     icon: "🚨", hint: "People can't do their job right now. We'll pick it up fastest." },
];
const HELP = [
  { q: "Add a landlord", a: "Properties → Add landlord, or the + Add landlord button at the top. They appear at sign-in straight away.", href: "/properties?addLandlord=1" },
  { q: "Add a property and its rooms", a: "Properties → Add property (type the postcode to search). Open it → Add room. Each room gets its own photos and tenancy.", href: "/properties" },
  { q: "Put a tenant in a room", a: "Open the property → Add tenancy on the room: quick add, pick an existing tenant, or the full five-step intake.", href: "/properties" },
  { q: "Ask the landlord for a document", a: "Open the property → Documents → Request from landlord. They get a one-time upload link; the file lands on the property by itself.", href: "/properties" },
  { q: "Share a file with someone outside", a: "Open any photo or document → Share link. Works without an account, expires, and you can withdraw it from Files.", href: "/files" },
  { q: "Add a colleague", a: "Settings → Users. Only the admin adds people; everyone signs in as themselves.", href: "/settings" },
  { q: "See what the system did", a: "What the system did — every change, who made it, hash-chained.", href: "/audit" },
];

export default function SupportPage() {
  const { profile } = useAuth();
  const [kind, setKind] = useState("problem"); const [subject, setSubject] = useState(""); const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [sent, setSent] = useState<{ emailed: boolean } | null>(null);
  const [past, setPast] = useState<Req[]>([]);
  const [health, setHealth] = useState<{ status: string; worker: string } | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);

  function load() { fetch("/api/support").then((r) => (r.ok ? r.json() : [])).then((d) => setPast(Array.isArray(d) ? d : [])).catch(() => {}); }
  useEffect(() => { load(); fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => {}); }, []);

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setSent(null);
    try {
      const r = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, subject, body, pageUrl: document.referrer || window.location.href }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "Could not send"); return; }
      setSent({ emailed: Boolean(b?.emailed) }); setSubject(""); setBody(""); load();
    } catch { setError("Could not reach the server."); } finally { setBusy(false); }
  }

  const chosen = KINDS.find((k) => k.key === kind) ?? KINDS[0]!;
  const live = health?.status === "ok" && health?.worker === "ok";
  const openCount = past.filter((p) => p.status === "open").length;

  return (
    <div style={{ padding: "1.75rem", maxWidth: 1040 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ margin: 0 }}>Support</h1>
          <p className="sub" style={{ margin: "4px 0 0" }}>Always here. Tell us what&apos;s happening and we&apos;ll come back to you{profile?.email ? ` at ${profile.email}` : ""}.</p>
        </div>
        <div className="sup-promise">
          <div><b>Reply time</b><p>Urgent · within the hour · 09:00–18:00 Mon–Fri. Everything else · same working day.</p></div>
          <div><b>What we read</b><p>Who you are · your role · the page you came from · the browser you&apos;re on. You don&apos;t have to say.</p></div>
        </div>
      </div>

      <div className="sup-grid">
        <section className="card sup-form">
          <div className="ch">
            <h3>Message the team</h3>
            {health && <span className={`pill ${live ? "live" : "paused"}`}><span className="dot" /> {live ? "System live" : "Checking"}</span>}
          </div>
          <form onSubmit={send} className="li" style={{ display: "grid", gap: 12 }}>
            <div className="sup-kinds" role="radiogroup" aria-label="What kind of message">
              {KINDS.map((k) => (
                <button key={k.key} type="button" role="radio" aria-checked={kind === k.key} onClick={() => setKind(k.key)}
                  className={`sup-kind ${kind === k.key ? "on" : ""} ${k.key === "urgent" ? "urg" : ""}`}>
                  <span className="icn">{k.icon}</span>
                  <span className="lbl">{k.label}</span>
                </button>
              ))}
            </div>
            <p className="muted" style={{ margin: "-2px 2px 0", fontSize: 12 }}>{chosen.hint}</p>
            <label><span className="lbl">In one line</span><input ref={subjectRef} value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder={kind === "problem" ? "e.g. Photo won't save on room 3" : kind === "question" ? "e.g. How do I move a tenant to another room?" : kind === "urgent" ? "e.g. Nobody can sign in" : "e.g. Add a one-tap &ldquo;mark everyone paid this week&rdquo;"} style={inp} /></label>
            <label><span className="lbl">What happened / what you need</span><textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={5} placeholder="What you did, what you expected, what you saw. A screenshot in a follow-up email helps." style={{ ...inp, resize: "vertical" }} /></label>
            {error && <p className="form-error" style={{ margin: 0 }}>{error}</p>}
            {sent && <p className="flash" style={{ margin: 0 }}>{sent.emailed ? "Sent. It's with the team and logged below." : "Logged below. (Email isn't configured on this environment yet — call or WhatsApp for anything urgent.)"}</p>}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" className="rel" disabled={busy || !subject.trim() || !body.trim()}>{busy ? "Sending…" : chosen.key === "urgent" ? "Send — urgent" : "Send"}</button>
              <span className="muted" style={{ fontSize: 12 }}>Your name, role, workspace and the page you came from are attached automatically.</span>
            </div>
          </form>
        </section>

        <section className="card sup-help">
          <div className="ch"><h3>Quick answers</h3><span className="muted" style={{ fontSize: 12 }}>the seven things people ask most</span></div>
          {HELP.map((h) => (
            <Link key={h.q} href={h.href} className="li row"><div className="body"><b>{h.q}</b><p>{h.a}</p></div><span className="chev">›</span></Link>
          ))}
        </section>
      </div>

      <section className="card" style={{ marginTop: 18 }}>
        <div className="ch"><h3>Your messages</h3><span className="muted">{past.length === 0 ? "none yet" : `${past.length} · ${openCount} open`}</span></div>
        {past.length === 0 ? <div className="li"><p className="muted">Nothing sent from this account yet. The first one lands here with its status.</p></div> : past.map((r) => (
          <div className="li" key={r.id}>
            <div className="body"><b>{KINDS.find((k) => k.key === r.kind)?.icon} {r.subject}</b><p style={{ whiteSpace: "pre-wrap" }}>{r.body}</p><p className="muted">{r.from_name} · {formatDateTime(r.created_at)}{r.emailed ? "" : " · not emailed"}</p></div>
            <span className="tag" style={r.status === "open" ? { background: "rgba(232,168,76,.16)", color: "var(--amber-deep)" } : { background: "rgba(30,127,79,.12)", color: "#1E7F4F" }}>{r.status}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
