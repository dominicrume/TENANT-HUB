"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "../../../lib/supabase-browser";
import * as s from "../_authStyles";

// No tenant self-signup — staff roles only (tenants are created via intake).
const ROLES = [
  { value: "manager", label: "Manager" },
  { value: "support_worker", label: "Support Worker" },
] as const;

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]["value"]>("support_worker");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = getSupabaseBrowser();
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    router.push("/login");
  }

  return (
    <main style={s.page}>
      <span style={s.officialBadge}>OFFICIAL USE ONLY</span>
      <div style={s.card}>
        <h1 style={s.heading}>Create staff account</h1>
        <p style={s.subBrands}>Tenant Hub — Ash Shahada Housing Association Ltd</p>

        <form onSubmit={onSubmit}>
          <label style={s.label} htmlFor="fullName">Full name</label>
          <input id="fullName" type="text" required style={s.input}
            value={fullName} onChange={(e) => setFullName(e.target.value)} />

          <label style={s.label} htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" style={s.input}
            value={email} onChange={(e) => setEmail(e.target.value)} />

          <label style={s.label} htmlFor="password">Password</label>
          <input id="password" type="password" required minLength={8} autoComplete="new-password"
            style={s.input} value={password} onChange={(e) => setPassword(e.target.value)} />

          <label style={s.label} htmlFor="role">Role</label>
          <select id="role" style={s.input} value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>

          {error && <div style={s.errorBox}>{error}</div>}

          <button type="submit" style={s.submit} disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <div style={{ marginTop: "16px", textAlign: "center" }}>
          <Link href="/login" style={s.link}>Already have an account? Sign in</Link>
        </div>
      </div>
    </main>
  );
}
