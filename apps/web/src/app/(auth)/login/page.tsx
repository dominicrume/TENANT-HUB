"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as s from "../_authStyles";

/**
 * Sign in — Tenant Hub's own sessions (D27). Two panels: what the product is,
 * and the form. The form says what's wrong in plain words, shows the password
 * on request, warns about Caps Lock, and never leaves you guessing whether
 * anything happened (Rume, 2026-10-15: "imagine this is Google").
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  useEffect(() => {
    fetch("/api/auth/google?status=1").then((r) => (r.ok ? r.json() : null)).then((j) => setGoogleEnabled(Boolean(j?.enabled))).catch(() => {});
    // The sign-in link the admin hands out carries the email, so the person only types the password they were given.
    try { const e = new URLSearchParams(window.location.search).get("email"); if (e) setEmail(e); } catch { /* fine */ }
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [caps, setCaps] = useState(false);
  const [touched, setTouched] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  function goHome(role: string) {
    if (role === "tenant") router.push("/my-home");
    else if (role === "contractor") router.push("/jobs");
    else if (role === "manager" || role === "admin") router.push("/choose-workspace");
    else router.push("/dashboard");
    router.refresh();
  }

  async function onMfaSubmit(e: FormEvent) {
    e.preventDefault();
    if (!mfaChallenge) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/auth/mfa/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challenge: mfaChallenge, code: mfaCode }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.error ?? "That code didn't match"); if (body?.expired) { setMfaChallenge(null); setMfaCode(""); } setLoading(false); return; }
      goHome(body?.role ?? "tenant");
    } catch { setError("Could not reach the server. Check your connection and try again."); setLoading(false); }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!emailOk) { setError("That doesn't look like an email address."); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(res.status === 401 ? "Email or password isn't right. Check both — passwords are case-sensitive." : res.status === 429 ? "Too many tries. Wait a minute and try again." : body?.error ?? "Could not sign you in.");
        setLoading(false); return;
      }
      if (body?.mfaRequired && typeof body.challenge === "string") { setMfaChallenge(body.challenge); setMfaCode(""); setLoading(false); return; }
      goHome(body?.role ?? "tenant");
    } catch { setError("Could not reach the server. Check your connection and try again."); setLoading(false); }
  }

  const eye = (on: boolean) => on
    ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
    : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>;

  return (
    <main style={{ ...s.page, padding: 0, alignItems: "stretch" }}>
      <div className="auth-split" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)", width: "100%", minHeight: "100vh" }}>
        {/* The product, in one panel. */}
        <section className="auth-brand" style={{ background: "var(--navy)", color: "#fff", padding: "clamp(28px, 6vw, 72px)", display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(900px 500px at 20% 110%, rgba(232,168,76,.22), transparent 60%)", pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 38, height: 38, borderRadius: 10, background: "var(--amber)", color: "var(--navy)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 18 }}>T</span>
              <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: ".01em" }}>Tenant Hub</span>
            </div>
            <h1 style={{ fontSize: "clamp(26px, 3.4vw, 40px)", lineHeight: 1.12, margin: "44px 0 14px", fontWeight: 700, maxWidth: 520 }}>Every tenant, from the first call to the last day — with the evidence that brings the money back.</h1>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,.72)", maxWidth: 480, margin: 0, lineHeight: 1.6 }}>Matty&apos;s Place runs its supported housing from here: leads, viewings, sign-up, the Housing Benefit claim, the council email, the landlord&apos;s portal — each station green only when the document exists.</p>
            <ol style={{ listStyle: "none", padding: 0, margin: "34px 0 0", display: "grid", gap: 12, maxWidth: 440 }}>
              {[["Leads & diary", "A viewing lands in the diary of whoever does it."], ["Sign-up pack", "Seven sections, filled from the record, signed on the pad."], ["Evidence everywhere", "Claim done means the HB form is on file. Not a tick."]].map(([t, d], i) => (
                <li key={t} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,.12)", display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 700, flex: "none" }}>{i + 1}</span>
                  <span><b style={{ display: "block", fontSize: 14 }}>{t}</b><span style={{ fontSize: 13, color: "rgba(255,255,255,.65)" }}>{d}</span></span>
                </li>
              ))}
            </ol>
          </div>
          <p style={{ position: "relative", fontSize: 12, color: "rgba(255,255,255,.5)", margin: "30px 0 0" }}>OFFICIAL USE ONLY · Ash Shahada Housing Association · Matty&apos;s Place · Reliance Housing</p>
        </section>

        {/* The form. */}
        <section style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "clamp(20px, 5vw, 56px)" }}>
          <div style={{ width: "100%", maxWidth: 420 }}>
            <h2 style={{ ...s.heading, fontSize: 26, marginBottom: 6 }}>{mfaChallenge ? "One more step" : "Sign in"}</h2>
            <p style={{ ...s.subBrands, fontSize: 13.5 }}>{mfaChallenge ? "Your account has an authenticator app. Enter the code it shows." : "Use the email and password the admin set you up with."}</p>

            {mfaChallenge ? (
              <form onSubmit={onMfaSubmit}>
                <label style={s.label} htmlFor="mfa-code">Code from your authenticator app</label>
                <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" autoFocus required placeholder="123 456"
                  style={{ ...s.input, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2, fontSize: 18 }} value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} />
                <p style={{ fontSize: "12px", color: "#64748B", marginTop: "6px" }}>Lost the app? Enter one of your recovery codes instead.</p>
                {error && <div style={s.errorBox} role="alert">{error}</div>}
                <button type="submit" style={s.submit} disabled={loading || mfaCode.trim().length < 6}>{loading ? "Checking…" : "Continue"}</button>
                <button type="button" onClick={() => { setMfaChallenge(null); setMfaCode(""); setError(null); }} style={{ marginTop: 10, width: "100%", background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Back to password</button>
              </form>
            ) : (
              <form onSubmit={onSubmit} noValidate>
                <label style={s.label} htmlFor="email">Email</label>
                <input id="email" type="email" required autoComplete="email" autoFocus inputMode="email" spellCheck={false}
                  style={{ ...s.input, borderColor: touched && !emailOk ? "#E05252" : undefined }} value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)} />
                {touched && !emailOk && email.length > 0 && <p style={{ fontSize: 12, color: "#E05252", margin: "6px 0 0" }}>That doesn&apos;t look like an email address.</p>}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <label style={s.label} htmlFor="password">Password</label>
                  <Link href="/reset-password" style={{ ...s.link, fontSize: 12.5 }}>Forgot it?</Link>
                </div>
                <div style={{ position: "relative" }}>
                  <input id="password" type={showPassword ? "text" : "password"} required autoComplete="current-password" autoFocus={!!email} style={{ ...s.input, paddingRight: "44px" }}
                    value={password} onChange={(e) => setPassword(e.target.value)} onKeyUp={(e) => setCaps(e.getModifierState && e.getModifierState("CapsLock"))} />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"}
                    style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#64748B", padding: "4px" }}>{eye(showPassword)}</button>
                </div>
                {caps && <p style={{ fontSize: 12, color: "#B24A31", margin: "6px 0 0" }}>Caps Lock is on.</p>}

                {error && <div style={s.errorBox} role="alert">{error}</div>}

                <button type="submit" style={{ ...s.submit, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }} disabled={loading || !email || !password}>
                  {loading && <span aria-hidden="true" style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "authspin .8s linear infinite" }} />}
                  {loading ? "Signing you in…" : "Sign in"}
                </button>
              </form>
            )}

            {googleEnabled && !mfaChallenge && (
              <div style={{ marginTop: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 12px", color: "#8A93A0", fontSize: 12 }}><span style={{ flex: 1, height: 1, background: "#E9E1D4" }} />or<span style={{ flex: 1, height: 1, background: "#E9E1D4" }} /></div>
                <a href="/api/auth/google" style={{ ...s.submit, marginTop: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "#fff", color: "#0F1C2E", border: "1.5px solid #C9C0B0", textDecoration: "none" }}>
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.7 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.8 6C6.5 42.6 14.6 48 24 48z"/></svg>
                  Sign in with Google
                </a>
              </div>
            )}

            {!mfaChallenge && (
              <>
                <p style={{ marginTop: 22, fontSize: 13, color: "#64748B", textAlign: "center" }}>
                  Joining a team on Tenant Hub? <Link href="/register" style={{ color: "var(--navy)", fontWeight: 600, textDecoration: "none" }}>Request access</Link> — your admin approves you and sends your link.
                </p>
                <p style={{ marginTop: 8, fontSize: 13, color: "#64748B", textAlign: "center" }}>
                  Starting a new Managing Agent? <Link href="/signup" style={{ color: "var(--amber-deep)", fontWeight: 600, textDecoration: "none" }}>Create your own account →</Link>
                </p>
              </>
            )}
            <p style={{ marginTop: 26, fontSize: 11.5, color: "#94A3B8", textAlign: "center" }}>Signed-in sessions are tied to your account. Every change you make carries your name.</p>
          </div>
        </section>
      </div>
      <style jsx global>{`
        @keyframes authspin { to { transform: rotate(360deg); } }
        @media (max-width: 860px) { .auth-split { grid-template-columns: 1fr !important; } .auth-brand { min-height: 0 !important; padding: 24px 20px !important; } .auth-brand h1 { font-size: 22px !important; margin-top: 18px !important; } .auth-brand ol { display: none !important; } }
      `}</style>
    </main>
  );
}
