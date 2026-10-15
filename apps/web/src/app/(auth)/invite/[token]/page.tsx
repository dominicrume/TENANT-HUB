/**
 * Accept an invite: the page says who the link is for and where, then takes a
 * password the person can see while typing, confirm, and judge — and signs
 * them straight in (Rume, 2026-10-15: "imagine this is Google or Amazon").
 */
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as s from "../../_authStyles";

interface Who { email: string; fullName: string | null; role: string; organisation: string | null; alreadyHasAccount: boolean }

function strength(p: string): { score: number; label: string; colour: string } {
  let score = 0;
  if (p.length >= 10) score++; if (p.length >= 14) score++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  if (score <= 1) return { score, label: "Too weak", colour: "#B24A31" };
  if (score === 2) return { score, label: "Weak", colour: "#B24A31" };
  if (score === 3) return { score, label: "Fair", colour: "#E8A84C" };
  if (score === 4) return { score, label: "Good", colour: "#1E7F4F" };
  return { score, label: "Strong", colour: "#1E7F4F" };
}

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [who, setWho] = useState<Who | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/auth/invite/accept?token=${encodeURIComponent(token)}`).then(async (r) => { const b = await r.json().catch(() => null); if (r.ok) setWho(b); else setLinkError(b?.error ?? "This invite link can't be used."); }).catch(() => setLinkError("Could not reach the server."));
  }, [token]);

  const st = strength(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length >= 10 && confirm === password && !loading;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setLoading(true); setError(null);
    const res = await fetch("/api/auth/invite/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
    const body = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) { setError(body?.error ?? "Something went wrong. Ask for a new invite."); return; }
    router.replace(body.role === "tenant" ? "/my-home" : body.role === "contractor" ? "/jobs" : "/dashboard");
  }

  const rules: Array<[string, boolean]> = [
    ["At least 10 characters", password.length >= 10],
    ["A capital and a small letter", /[a-z]/.test(password) && /[A-Z]/.test(password)],
    ["A number or a symbol", /\d|[^A-Za-z0-9]/.test(password)],
  ];

  return (
    <main style={s.page}>
      <span style={s.officialBadge}>OFFICIAL USE ONLY</span>
      <div style={{ ...s.card, maxWidth: 460 }}>
        <h1 style={s.heading}>Welcome to Tenant Hub</h1>
        {linkError ? (
          <>
            <div style={s.errorBox}>{linkError}</div>
            <div style={{ marginTop: 16, textAlign: "center" }}><Link href="/login" style={s.link}>Go to sign in</Link></div>
          </>
        ) : !who ? (
          <p style={s.subBrands}>Checking your invite…</p>
        ) : who.alreadyHasAccount ? (
          <>
            <p style={s.subBrands}>There&apos;s already an account for <b>{who.email}</b>. Sign in with it — or reset the password if you&apos;ve forgotten it.</p>
            <Link href="/login" style={{ ...s.submit, display: "block", textAlign: "center", textDecoration: "none" }}>Sign in</Link>
            <div style={{ marginTop: 12, textAlign: "center" }}><Link href="/reset-password" style={s.link}>Forgot password</Link></div>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <p style={s.subBrands}>
              {who.fullName ? <>Hello <b>{who.fullName}</b>. </> : null}This sets up <b>{who.email}</b> as {/^[aeiou]/i.test(who.role) ? "an" : "a"} {who.role.replace("_", " ")}{who.organisation ? ` at ${who.organisation}` : ""}. Choose a password and you&apos;re in.
            </p>
            <label style={s.label} htmlFor="password">Password</label>
            <div style={{ position: "relative" }}>
              <input id="password" type={show ? "text" : "password"} required minLength={10} autoComplete="new-password" autoFocus style={{ ...s.input, paddingRight: 64 }}
                value={password} onChange={(e) => setPassword(e.target.value)} onKeyUp={(e) => setCaps(e.getModifierState && e.getModifierState("CapsLock"))} />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: "#0F1C2E", fontFamily: "inherit" }}>{show ? "Hide" : "Show"}</button>
            </div>
            {caps && <p style={{ fontSize: 12, color: "#B24A31", margin: "6px 0 0" }}>Caps Lock is on.</p>}
            {password.length > 0 && (
              <div style={{ margin: "8px 0 0" }}>
                <div style={{ display: "flex", gap: 3 }}>{[1, 2, 3, 4, 5].map((i) => <span key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i <= st.score ? st.colour : "#E6E0D6" }} />)}</div>
                <p style={{ fontSize: 12, color: st.colour, margin: "4px 0 0", fontWeight: 600 }}>{st.label}</p>
              </div>
            )}
            <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", fontSize: 12.5, color: "#64748B", display: "grid", gap: 2 }}>
              {rules.map(([r, ok]) => <li key={r} style={{ color: ok ? "#1E7F4F" : undefined }}>{ok ? "✓" : "○"} {r}</li>)}
            </ul>
            <label style={{ ...s.label, marginTop: 14 }} htmlFor="confirm">Type it again</label>
            <input id="confirm" type={show ? "text" : "password"} required autoComplete="new-password" style={{ ...s.input, borderColor: mismatch ? "#B24A31" : undefined }}
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {mismatch && <p style={{ fontSize: 12, color: "#B24A31", margin: "6px 0 0" }}>The two passwords don&apos;t match yet.</p>}
            {error && <div style={s.errorBox}>{error}{/already exists/i.test(error) && <> <Link href="/login" style={s.link}>Sign in</Link></>}</div>}
            <button type="submit" style={{ ...s.submit, opacity: ready ? 1 : 0.6 }} disabled={!ready}>{loading ? "Creating your account…" : "Create my account and sign in"}</button>
            <p style={{ fontSize: 12, color: "#64748B", marginTop: 10, textAlign: "center" }}>This link works once. You can change the password any time under Settings → Security.</p>
          </form>
        )}
      </div>
    </main>
  );
}
