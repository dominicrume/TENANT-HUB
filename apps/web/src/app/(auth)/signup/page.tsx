/**
 * Public signup for a brand-new Managing Agent (Matlub, 2026-10-24). Nobody
 * else creates the account — the person signing up types their organisation
 * name, their own name, email and a password, and lands on their own fresh
 * dashboard, data isolated from every other Managing Agent on the platform
 * (H2). The developer never touches it. "They should be original users."
 */
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as s from "../_authStyles";

export default function ManagingAgentSignupPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => { fetch("/api/auth/signup/status").then((r) => r.json()).then((j) => setOpen(Boolean(j?.open))).catch(() => setOpen(true)); }, []);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const pwScore = scorePassword(password);
  const pwOk = password.length >= 6;
  const match = password && confirm && password === confirm;
  const ready = orgName.trim().length > 1 && fullName.trim().length > 1 && emailOk && pwOk && match;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/auth/signup/managing-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName: orgName.trim(), fullName: fullName.trim(), email: email.trim(), password }),
      });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "Could not create the account."); setBusy(false); return; }
      // Session cookie is already set — go straight in.
      router.push("/dashboard");
      router.refresh();
    } catch { setError("Could not reach the server. Try again in a moment."); setBusy(false); }
  }

  if (open === false) {
    return (
      <div style={s.page}>
        <span style={s.officialBadge}>TENANT HUB · OFFICIAL</span>
        <div style={{ ...s.card, maxWidth: 480 }}>
          <h1 style={{ ...s.heading, margin: "0 0 6px" }}>Self-signup is closed</h1>
          <p style={{ margin: "0 0 16px", color: "var(--slate)", fontSize: 14 }}>New Managing Agents on this platform are onboarded by the platform owner, not through a public form. If you are expected on here, ask them to add you — you&apos;ll receive your sign-in link and password.</p>
          <p style={{ margin: 0, textAlign: "center", fontSize: 13 }}>
            Already have an account? <Link href="/login" style={s.link}>Sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <span style={s.officialBadge}>TENANT HUB · OFFICIAL</span>
      <div style={{ ...s.card, maxWidth: 480 }}>
        <h1 style={{ ...s.heading, margin: "0 0 6px" }}>Create your account</h1>
        <p style={{ margin: "0 0 20px", color: "var(--slate)", fontSize: 14 }}>You&apos;re the first admin of your own Managing Agent. Your data stays yours — no other Managing Agent sees any of it, and you see none of theirs.</p>

        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={s.label}>Managing agent name</span>
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g. Reliable Living" required autoComplete="organization" style={s.input} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={s.label}>Your full name</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Osama Loumilli" required autoComplete="name" style={s.input} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={s.label}>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="e.g. loumilli@reliableliving.co.uk" required autoComplete="email" style={s.input} />
            {email && !emailOk && <span style={{ fontSize: 12, color: "var(--brick)" }}>That doesn&apos;t look like a real email.</span>}
          </label>

          <div style={{ display: "grid", gap: 4 }}>
            <span style={s.label}>Password</span>
            <div style={{ position: "relative" }}>
              <input value={password} onChange={(e) => setPassword(e.target.value)} onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)} type={showPw ? "text" : "password"} required autoComplete="new-password" minLength={6} style={{ ...s.input, paddingRight: 64 }} />
              <button type="button" onClick={() => setShowPw((v) => !v)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "var(--slate)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{showPw ? "Hide" : "Show"}</button>
            </div>
            <div aria-hidden="true" style={{ display: "flex", gap: 4, marginTop: 2 }}>
              {[0, 1, 2, 3].map((i) => <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < pwScore ? (pwScore <= 1 ? "var(--brick)" : pwScore === 2 ? "var(--amber)" : "var(--live)") : "var(--line)" }} />)}
            </div>
            <span style={{ fontSize: 12, color: password.length === 0 ? "var(--slate-2)" : pwOk ? "var(--slate)" : "var(--brick)" }}>
              {password.length === 0 ? "At least 6 characters — a short phrase works well." : pwOk ? (pwScore >= 3 ? "Strong." : pwScore === 2 ? "OK — add a number or symbol to make it strong." : "Weak — mix words, numbers and a symbol.") : `${6 - password.length} more to reach the minimum.`}
            </span>
            {caps && <span style={{ fontSize: 12, color: "var(--amber-deep)" }}>Caps Lock is on.</span>}
          </div>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={s.label}>Confirm the password</span>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type={showPw ? "text" : "password"} required autoComplete="new-password" style={s.input} />
            {confirm && !match && <span style={{ fontSize: 12, color: "var(--brick)" }}>The two don&apos;t match yet.</span>}
          </label>

          {error && <div style={s.errorBox}>{error}</div>}

          <button type="submit" disabled={!ready || busy} style={{ ...s.submit, opacity: !ready || busy ? 0.55 : 1, cursor: !ready || busy ? "not-allowed" : "pointer" }}>
            {busy ? "Creating…" : "Create account & sign me in"}
          </button>

          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--slate)", textAlign: "center" }}>
            Already have an account? <Link href="/login" style={s.link}>Sign in instead</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

function scorePassword(p: string): number {
  if (!p) return 0;
  let n = 0;
  if (p.length >= 10) n++;
  if (p.length >= 14) n++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) n++;
  if (/\d/.test(p) || /[^A-Za-z0-9]/.test(p)) n++;
  return Math.min(4, n);
}
