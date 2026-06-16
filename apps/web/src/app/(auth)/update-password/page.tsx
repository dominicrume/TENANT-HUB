"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "../../../lib/supabase-browser";
import * as s from "../_authStyles";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isFatalError, setIsFatalError] = useState(false);

  useEffect(() => {
    // Check if the URL contains error codes from an expired or invalid link
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace("#", "?"));
    const errCode = searchParams.get("error_code") || hashParams.get("error_code");
    const errDesc = searchParams.get("error_description") || hashParams.get("error_description");

    if (errCode) {
      setError(errDesc ? decodeURIComponent(errDesc.replace(/\+/g, " ")) : "This password reset link is invalid or has expired.");
      setIsFatalError(true);
      setCheckingSession(false);
      return;
    }

    const supabase = getSupabaseBrowser();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // Wait briefly for the hash fragment to be processed by Supabase
        setTimeout(async () => {
          const { data: { session: delayedSession } } = await supabase.auth.getSession();
          if (!delayedSession) {
            setError("Recovery session expired or invalid. Please request a new link.");
            setIsFatalError(true);
          }
          setCheckingSession(false);
        }, 1000);
      } else {
        setCheckingSession(false);
      }
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = getSupabaseBrowser();
    // Validate: 12 chars, 1 lowercase, 1 uppercase, 1 number, 1 special character (any non-alphanumeric)
    const isStrong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/.test(password);
    if (!isStrong) {
      setError("Password must be at least 12 characters and include an uppercase letter, lowercase letter, number, and special character.");
      setLoading(false);
      return;
    }

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

        {checkingSession ? (
          <div style={{ textAlign: "center", color: "#64748B", fontSize: "14px", padding: "20px 0" }}>
            Verifying secure recovery link...
          </div>
        ) : isFatalError ? (
          <div style={{ textAlign: "center", color: "#E05252", fontSize: "14px", padding: "20px 0", background: "rgba(224, 82, 82, 0.1)", borderRadius: "8px", border: "1px solid rgba(224, 82, 82, 0.2)" }}>
            {error}
            <br/><br/>
            <button onClick={() => router.push("/login")} style={{...s.submit, marginTop: "10px"}}>Return to Login</button>
          </div>
        ) : (
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
        )}
      </div>
    </main>
  );
}
