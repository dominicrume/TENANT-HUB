"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as s from "../_authStyles";

/**
 * Login — Tenant Hub's own sessions (BUILD_PLAN C31, cut over 2026-10,
 * DECISIONS D27). Supabase Auth (and the Google sign-in it provided) is
 * gone; POST /api/auth/login is the only path in now.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // "Sign in with Google" appears only once GOOGLE_OAUTH_CLIENT_ID/SECRET are
  // configured — a button that leads to "not set up yet" would be worse than
  // no button. Invite-only still holds: Google only signs in an email that
  // already has a profile here; it never creates an account.
  const [googleEnabled, setGoogleEnabled] = useState(false);
  useEffect(() => {
    fetch("/api/auth/google?status=1").then((r) => (r.ok ? r.json() : null)).then((j) => setGoogleEnabled(Boolean(j?.enabled))).catch(() => {});
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // MFA (migration 052): when the password passes on an account with an
  // authenticator enrolled, the server hands back a 5-minute challenge instead
  // of a session, and the form becomes a single code box.
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  function goHome(role: string) {
    // Multi-org access (migration 046) is a manager-level concept —
    // /choose-workspace itself skips straight to /dashboard for the
    // common case (exactly one organisation), so this adds no extra
    // click for anyone who doesn't actually have a choice to make.
    if (role === "tenant") router.push("/my-home");
    else if (role === "contractor") router.push("/jobs");
    else if (role === "manager" || role === "admin") router.push("/choose-workspace");
    else router.push("/dashboard");
    router.refresh();
  }

  async function onMfaSubmit(e: FormEvent) {
    e.preventDefault();
    if (!mfaChallenge) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge: mfaChallenge, code: mfaCode }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "That code didn't match");
        if (body?.expired) { setMfaChallenge(null); setMfaCode(""); }
        setLoading(false);
        return;
      }
      goHome(body?.role ?? "tenant");
    } catch {
      setError("Could not reach the server. Try again.");
      setLoading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Login failed");
        setLoading(false);
        return;
      }
      if (body?.mfaRequired && typeof body.challenge === "string") {
        setMfaChallenge(body.challenge);
        setMfaCode("");
        setLoading(false);
        return;
      }
      goHome(body?.role ?? "tenant");
    } catch {
      setError("Could not reach the server. Try again.");
      setLoading(false);
    }
  }

  return (
    <main style={s.page}>
      <span style={s.officialBadge}>OFFICIAL USE ONLY</span>
      <div style={s.card}>
        <h1 style={s.heading}>Matty&apos;s Place</h1>
        <p style={s.subBrands}>
          The complete operating system for supported housing
        </p>

        {mfaChallenge ? (
        <form onSubmit={onMfaSubmit}>
          <label style={s.label} htmlFor="mfa-code">Code from your authenticator app</label>
          <input
            id="mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            placeholder="123 456"
            style={{ ...s.input, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2, fontSize: 18 }}
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
          />
          <p style={{ fontSize: "12px", color: "#64748B", marginTop: "6px" }}>Lost the app? Enter one of your recovery codes instead.</p>
          {error && <div style={s.errorBox}>{error}</div>}
          <button type="submit" style={s.submit} disabled={loading || mfaCode.trim().length < 6}>
            {loading ? "Checking…" : "Continue"}
          </button>
          <button type="button" onClick={() => { setMfaChallenge(null); setMfaCode(""); setError(null); }}
            style={{ marginTop: 10, width: "100%", background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 13 }}>
            Back to password
          </button>
        </form>
        ) : (
        <form onSubmit={onSubmit}>
          <label style={s.label} htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            style={s.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label style={s.label} htmlFor="password">Password</label>
          <div style={{ position: "relative" }}>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              style={{ ...s.input, paddingRight: "40px" }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#64748B",
                padding: "4px"
              }}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              )}
            </button>
          </div>

          {error && <div style={s.errorBox}>{error}</div>}

          <button type="submit" style={s.submit} disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
        )}

        {googleEnabled && !mfaChallenge && (
          <div style={{ marginTop: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 12px", color: "#8A93A0", fontSize: 12 }}>
              <span style={{ flex: 1, height: 1, background: "#E9E1D4" }} />or<span style={{ flex: 1, height: 1, background: "#E9E1D4" }} />
            </div>
            <a href="/api/auth/google" style={{ ...s.submit, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "#fff", color: "#0F1C2E", border: "1.5px solid #C9C0B0", textDecoration: "none" }}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.7 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.8 6C6.5 42.6 14.6 48 24 48z"/></svg>
              Sign in with Google
            </a>
          </div>
        )}

        <div style={{ marginTop: "16px", textAlign: "center", display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
          <Link href="/reset-password" style={s.link}>Forgot password?</Link>
          <Link href="/register" style={s.link}>Need an account? Request access</Link>
        </div>
      </div>
    </main>
  );
}
