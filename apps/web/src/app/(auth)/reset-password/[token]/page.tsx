/**
 * The "set a new password" step of Tenant Hub's own reset flow (BUILD_PLAN
 * C31) — the link POST /api/auth/password/reset-request emails points here.
 * Not yet reachable from the existing /reset-password request page, which
 * still uses Supabase's own flow (see DECISIONS D26): this page and its API
 * route are built and ready, not yet the live path.
 */
"use client";

import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import * as s from "../../_authStyles";

export default function ConfirmResetPage() {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/password/reset-confirm", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Something went wrong. Try requesting a new link.");
      return;
    }
    setDone(true);
  }

  return (
    <main style={s.page}>
      <span style={s.officialBadge}>OFFICIAL USE ONLY</span>
      <div style={s.card}>
        <h1 style={s.heading}>Set a new password</h1>

        {done ? (
          <div style={s.successBox}>
            Password changed. Every other device you were signed in on has been signed out.
            <div style={{ marginTop: "16px", textAlign: "center" }}>
              <Link href="/login" style={s.link}>Sign in</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <label style={s.label} htmlFor="password">New password</label>
            <input id="password" type="password" required minLength={10} autoComplete="new-password" style={s.input}
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <p style={{ fontSize: "12px", color: "var(--slate)", marginTop: "6px" }}>At least 10 characters.</p>

            {error && <div style={s.errorBox}>{error}</div>}

            <button type="submit" style={s.submit} disabled={loading || password.length < 10}>
              {loading ? "Saving…" : "Set password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
