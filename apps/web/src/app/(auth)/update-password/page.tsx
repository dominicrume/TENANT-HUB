"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "../../../lib/supabase-browser";
import * as s from "../_authStyles";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = getSupabaseBrowser();
    
    const { error: err } = await supabase.auth.updateUser({ password });
    
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main style={s.page}>
      <span style={s.officialBadge}>OFFICIAL USE ONLY</span>
      <div style={s.card}>
        <h1 style={s.heading}>Update password</h1>
        <p style={s.subBrands}>Please enter your new password below.</p>

        <form onSubmit={onSubmit}>
          <label style={s.label} htmlFor="password">New Password</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            style={s.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <div style={s.errorBox}>{error}</div>}

          <button type="submit" style={s.submit} disabled={loading}>
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </main>
  );
}
