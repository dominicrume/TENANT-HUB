"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "../../../lib/supabase-browser";
import * as s from "../_authStyles";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

    // The auth/callback route has already exchanged the code for a session
    // and set the cookies. We just need to verify the session exists.
    const supabase = getSupabaseBrowser();
    
    // Listen for the PASSWORD_RECOVERY event (legacy implicit flow) AND
    // check if we already have a valid session (PKCE flow via callback).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setCheckingSession(false);
      }
    });

    // Also do a direct session check — the callback route already exchanged
    // the code, so we should have session cookies.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setCheckingSession(false);
      } else {
        // Give a brief window for the auth state change listener to fire
        // (handles edge cases where cookies are being written asynchronously)
        setTimeout(async () => {
          const { data: { session: retrySession } } = await supabase.auth.getSession();
          if (retrySession) {
            setCheckingSession(false);
          } else {
            setError("Recovery session expired or invalid. Please request a new link.");
            setIsFatalError(true);
            setCheckingSession(false);
          }
        }, 2000);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = getSupabaseBrowser();

    // Validate passwords match
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    // Validate: 12 chars, 1 lowercase, 1 uppercase, 1 number, 1 special character (any non-alphanumeric)
    const isStrong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/.test(password);
    if (!isStrong) {
      setError("Password must be at least 6 characters and include an uppercase letter, lowercase letter, number, and special character.");
      setLoading(false);
      return;
    }

    const { data: { user }, error: err } = await supabase.auth.updateUser({ password });
    
    setLoading(false);
    if (err || !user) {
      setError(err?.message || "Password update failed");
      return;
    }
    
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const role = profile?.role || "tenant";
    
    if (role === "tenant") {
      router.push("/my-home");
    } else if (role === "contractor") {
      router.push("/jobs");
    } else {
      router.push("/dashboard");
    }
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
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ color: "#E05252", fontSize: "14px", padding: "16px", background: "rgba(224, 82, 82, 0.1)", borderRadius: "8px", border: "1px solid rgba(224, 82, 82, 0.2)", marginBottom: "16px" }}>
              {error}
            </div>
            <button onClick={() => router.push("/reset-password")} style={{...s.submit, marginBottom: "8px"}}>Request a New Link</button>
            <button onClick={() => router.push("/login")} style={{...s.submit, backgroundColor: "transparent", color: "#0B1B3D", border: "1px solid #0B1B3D"}}>Return to Login</button>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <label style={s.label} htmlFor="password">New Password</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              style={s.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <label style={s.label} htmlFor="confirmPassword">Confirm New Password</label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              style={s.input}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
