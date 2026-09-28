/**
 * Accept an invite to Tenant Hub's own sessions (BUILD_PLAN C31). One field: choose a password.
 * Not reachable from anywhere in the live app yet — the invite route it pairs with answers 503
 * until DATABASE_URL is set on production (DECISIONS D26).
 */
"use client";

import { useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import * as s from "../../_authStyles";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/invite/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
    const body = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) { setError(body?.error ?? "Something went wrong. Ask for a new invite."); return; }
    router.replace(body.role === "tenant" ? "/my-home" : body.role === "contractor" ? "/jobs" : "/dashboard");
  }

  return (
    <main style={s.page}>
      <span style={s.officialBadge}>OFFICIAL USE ONLY</span>
      <div style={s.card}>
        <h1 style={s.heading}>Welcome to Tenant Hub</h1>
        <p style={s.subBrands}>Choose a password to finish setting up your account.</p>
        <form onSubmit={onSubmit}>
          <label style={s.label} htmlFor="password">Password</label>
          <input id="password" type="password" required minLength={10} autoComplete="new-password" style={s.input}
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <p style={{ fontSize: "12px", color: "var(--slate)", marginTop: "6px" }}>At least 10 characters.</p>
          {error && <div style={s.errorBox}>{error}</div>}
          <button type="submit" style={s.submit} disabled={loading || password.length < 10}>{loading ? "Creating…" : "Create my account"}</button>
        </form>
      </div>
    </main>
  );
}
