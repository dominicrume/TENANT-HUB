"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "../../../lib/supabase-browser";
import * as s from "../_authStyles";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = getSupabaseBrowser();
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo:
        typeof window !== "undefined" ? `${window.location.origin}/login` : undefined,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  }

  return (
    <main style={s.page}>
      <span style={s.officialBadge}>OFFICIAL USE ONLY</span>
      <div style={s.card}>
        <h1 style={s.heading}>Reset password</h1>
        <p style={s.subBrands}>We&apos;ll email you a reset link.</p>

        {sent ? (
          <div style={s.successBox}>
            If an account exists for <strong>{email}</strong>, a reset link is on its way.
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <label style={s.label} htmlFor="email">Email</label>
            <input id="email" type="email" required autoComplete="email" style={s.input}
              value={email} onChange={(e) => setEmail(e.target.value)} />

            {error && <div style={s.errorBox}>{error}</div>}

            <button type="submit" style={s.submit} disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <div style={{ marginTop: "16px", textAlign: "center" }}>
          <Link href="/login" style={s.link}>Back to sign in</Link>
        </div>
      </div>
    </main>
  );
}
