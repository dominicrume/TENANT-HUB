"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

/**
 * Settings → Security: two-step sign-in with an authenticator app (migration
 * 052). Enrol → scan QR (or type the key) → prove one code → recovery codes
 * shown once. From then on a password alone doesn't open this account.
 * Turning it off needs a current code too.
 */
export function SecurityTab() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [recoveryLeft, setRecoveryLeft] = useState(0);
  const [pending, setPending] = useState<{ secret: string; uri: string; qr: string | null } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disabling, setDisabling] = useState(false);

  const load = useCallback(async () => {
    try { const r = await fetch("/api/auth/mfa/setup"); if (r.ok) { const b = await r.json(); setEnabled(Boolean(b.enabled)); setRecoveryLeft(Number(b.recoveryCodesLeft ?? 0)); } } catch { /* keep state */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function start() {
    setBusy(true); setError(null); setRecoveryCodes(null);
    try {
      const r = await fetch("/api/auth/mfa/setup", { method: "POST" });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "Could not start set-up."); return; }
      let qr: string | null = null;
      try { const QRCode = await import("qrcode"); qr = await QRCode.toDataURL(b.uri, { margin: 1, width: 196, color: { dark: "#0F1C2E", light: "#FFFFFF" } }); } catch { qr = null; }
      setPending({ secret: b.secret, uri: b.uri, qr });
      setCode("");
    } catch { setError("Could not reach the server."); }
    finally { setBusy(false); }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/auth/mfa/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code.replace(/\s+/g, "") }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "That code didn't match."); return; }
      setRecoveryCodes(b.recoveryCodes ?? []);
      setPending(null); setCode("");
      await load();
    } catch { setError("Could not reach the server."); }
    finally { setBusy(false); }
  }

  async function disable(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/auth/mfa/disable", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code.trim() }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "That code didn't match."); return; }
      setDisabling(false); setCode(""); setRecoveryCodes(null);
      await load();
    } catch { setError("Could not reach the server."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <section className="card" style={{ marginBottom: 18 }}>
        <div className="ch"><h3>Two-step sign-in</h3></div>
        <div className="li" style={{ display: "block" }}>
          {enabled === null && <p className="muted">Checking…</p>}
          {enabled === false && !pending && (
            <>
              <p style={{ margin: "0 0 10px" }}>Off. Your password is the only thing protecting this account.</p>
              <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>Turn it on and every sign-in also asks for a 6-digit code from an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, Authy, 1Password…). Strongly recommended for managers — this account can see every tenant&apos;s record.</p>
              <button type="button" className="rel sm" onClick={start} disabled={busy}>{busy ? "Starting…" : "Turn on two-step sign-in"}</button>
            </>
          )}
          {pending && (
            <form onSubmit={confirm} style={{ display: "grid", gap: 12 }}>
              <p style={{ margin: 0 }}><b>1.</b> Open your authenticator app and scan this:</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL generated in the browser; the optimizer has nothing to fetch */}
              {pending.qr ? <img src={pending.qr} alt="QR code for your authenticator app" width={196} height={196} style={{ borderRadius: 10, border: "1px solid var(--line)" }} />
                          : <p className="muted" style={{ margin: 0, fontSize: 13 }}>(QR unavailable — type the key below instead.)</p>}
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>Can&apos;t scan? Enter this key by hand: <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, letterSpacing: 1, userSelect: "all" }}>{pending.secret.match(/.{1,4}/g)?.join(" ")}</code></p>
              <p style={{ margin: "6px 0 0" }}><b>2.</b> Type the 6-digit code the app shows now:</p>
              <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123 456" required style={{ ...inp, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2, fontSize: 18, maxWidth: 200 }} />
              {error && <p style={{ color: "var(--brick)", margin: 0, fontSize: 13 }}>{error}</p>}
              <div style={{ display: "flex", gap: 10 }}>
                <button type="submit" className="rel sm" disabled={busy || code.replace(/\s+/g, "").length !== 6}>{busy ? "Checking…" : "Confirm and turn on"}</button>
                <button type="button" className="btn ghost sm" onClick={() => { setPending(null); setCode(""); setError(null); }}>Cancel</button>
              </div>
            </form>
          )}
          {enabled && !disabling && (
            <>
              <p style={{ margin: "0 0 6px", color: "var(--live)", fontWeight: 600 }}>● On</p>
              <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>Every sign-in asks for a code from your app. Recovery codes left: <b>{recoveryLeft}</b>{recoveryLeft <= 2 ? " — turn two-step off and on again to get a fresh set." : "."}</p>
              <button type="button" className="btn ghost sm" onClick={() => { setDisabling(true); setCode(""); setError(null); }}>Turn off…</button>
            </>
          )}
          {enabled && disabling && (
            <form onSubmit={disable} style={{ display: "grid", gap: 12 }}>
              <p style={{ margin: 0 }}>To turn two-step sign-in off, enter a current code from your app (or a recovery code):</p>
              <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" placeholder="123456 or xxxxx-xxxxx" required style={{ ...inp, fontFamily: "'JetBrains Mono', monospace", maxWidth: 240 }} />
              {error && <p style={{ color: "var(--brick)", margin: 0, fontSize: 13 }}>{error}</p>}
              <div style={{ display: "flex", gap: 10 }}>
                <button type="submit" className="rel sm" disabled={busy || code.trim().length < 6} style={{ background: "var(--brick)" }}>{busy ? "Checking…" : "Turn off"}</button>
                <button type="button" className="btn ghost sm" onClick={() => { setDisabling(false); setCode(""); setError(null); }}>Keep it on</button>
              </div>
            </form>
          )}
        </div>
      </section>

      {recoveryCodes && (
        <section className="card" style={{ marginBottom: 18, borderColor: "var(--amber)" }}>
          <div className="ch"><h3>Your recovery codes — save these now</h3></div>
          <div className="li" style={{ display: "block" }}>
            <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>Each one signs you in once if you lose your phone. They are shown <b>only this once</b>; write them down or keep them in a password manager.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, maxWidth: 360, fontFamily: "'JetBrains Mono', monospace", fontSize: 15 }}>
              {recoveryCodes.map((c) => <code key={c} style={{ padding: "6px 10px", background: "var(--cream)", borderRadius: 8, userSelect: "all" }}>{c}</code>)}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button type="button" className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(recoveryCodes.join("\n")).catch(() => {})}>Copy all</button>
              <button type="button" className="rel sm" onClick={() => setRecoveryCodes(null)}>I&apos;ve saved them</button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

const inp: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
