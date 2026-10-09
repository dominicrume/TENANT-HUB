/**
 * Request access — how someone without an account gets one (migration 055).
 * Fill this in → the organisation's managers get an email → one of them
 * approves under Settings → Users → you get the invite link that creates
 * your account. Invite-only is kept; the queue in front of it is new.
 */
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import * as s from "../_authStyles";

interface Org { id: string; name: string }

export default function RegisterPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roleWanted, setRoleWanted] = useState("support_worker");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/auth/register").then((r) => (r.ok ? r.json() : [])).then((d: Org[]) => { setOrgs(d); if (d.length === 1) setOrgId(d[0]!.id); }).catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId, fullName, email, phone, roleWanted, message }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "Could not send the request. Try again."); setBusy(false); return; }
      setDone(true);
    } catch { setError("Could not reach the server. Try again."); setBusy(false); }
  }

  return (
    <main style={s.page}>
      <div style={{ ...s.card, maxWidth: 520 }}>
        <h1 style={s.heading}>Request access</h1>
        {done ? (
          <>
            <p style={s.subBrands}>Thanks, {fullName.split(/\s+/)[0]}. A manager at {orgs.find((o) => o.id === orgId)?.name ?? "the organisation"} has been told. When they approve, you&apos;ll get an email with a one-time link to set your password.</p>
            <p style={{ fontSize: 13, color: "#64748B" }}>Nothing more to do here — you can close this page.</p>
            <div style={{ marginTop: 16, textAlign: "center" }}><Link href="/login" style={s.link}>Back to sign in</Link></div>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <p style={s.subBrands}>Accounts are approved by a manager, not created on the spot. Tell us who you are and where you work; they&apos;ll get an email to approve you.</p>
            <label style={s.label} htmlFor="org">Organisation</label>
            <select id="org" required value={orgId} onChange={(e) => setOrgId(e.target.value)} style={s.input}>
              <option value="">Choose…</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <label style={s.label} htmlFor="name">Your full name</label>
            <input id="name" required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} style={s.input} />
            <label style={s.label} htmlFor="email">Work email</label>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={s.input} />
            <label style={s.label} htmlFor="phone">Mobile (optional)</label>
            <input id="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={s.input} />
            <label style={s.label} htmlFor="role">Access needed</label>
            <select id="role" value={roleWanted} onChange={(e) => setRoleWanted(e.target.value)} style={s.input}>
              <option value="support_worker">Support worker — my assigned tenants</option>
              <option value="manager">Manager — everything</option>
              <option value="contractor">Contractor — my repair jobs</option>
            </select>
            <label style={s.label} htmlFor="msg">Anything the manager should know (optional)</label>
            <textarea id="msg" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. I start on Monday, covering the Sparkbrook houses" style={{ ...s.input, resize: "vertical", fontFamily: "inherit" }} />
            {error && <div style={s.errorBox}>{error}</div>}
            <button type="submit" style={s.submit} disabled={busy || !orgId || !fullName || !email}>{busy ? "Sending…" : "Send request"}</button>
            <div style={{ marginTop: 16, textAlign: "center" }}><Link href="/login" style={s.link}>Already have an account? Sign in</Link></div>
          </form>
        )}
      </div>
    </main>
  );
}
