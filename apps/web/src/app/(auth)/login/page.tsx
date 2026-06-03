"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "../../../lib/supabase-browser";
import * as s from "../_authStyles";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = getSupabaseBrowser();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    // Full reload so middleware re-runs with the fresh session cookie.
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main style={s.page}>
      <span style={s.officialBadge}>OFFICIAL USE ONLY</span>
      <div style={s.card}>
        <h1 style={s.heading}>Tenant Hub</h1>
        <p style={s.subBrands}>
          Ash Shahada Housing Association Ltd · Matty&apos;s Place · Reliance
        </p>

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
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            style={s.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <div style={s.errorBox}>{error}</div>}

          <button type="submit" style={s.submit} disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <div style={{ marginTop: "16px", textAlign: "center" }}>
          <Link href="/reset-password" style={s.link}>Forgot password?</Link>
          <span style={{ ...s.link, margin: "0 8px" }}>·</span>
          <Link href="/signup" style={s.link}>Create staff account</Link>
        </div>
      </div>
    </main>
  );
}
