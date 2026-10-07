/**
 * The wall-QR repair report (BUILD_PLAN C33). Whoever scans the poster has no
 * account and needs none — one field, in their own words, sent straight to
 * Today for triage. Same navy/amber/cream language as the auth pages since
 * this is also a stranger's very first look at Tenant Hub.
 */
"use client";

import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import * as s from "../../(auth)/_authStyles";

export default function PublicReportPage() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const [raw, setRaw] = useState("");
  const [reporter, setReporter] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/report/${propertyId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_report: raw, reporter: reporter.trim() || undefined }),
    });
    const body = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) { setError(body?.error ?? "Could not send that. Please try again."); return; }
    setSent(true);
  }

  if (sent) {
    return (
      <main style={s.page}>
        <div style={s.card}>
          <h1 style={s.heading}>Thanks, that&apos;s been sent</h1>
          <p style={{ fontSize: "14px", color: "var(--slate)", lineHeight: 1.5 }}>
            Someone will look at this and be in touch if we need more from you. No need to call.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={s.page}>
      <div style={s.card}>
        <h1 style={s.heading}>Report a repair</h1>
        <p style={s.subBrands}>Tell us what&apos;s wrong. Be as clear as you like. There&apos;s no wrong way to say it.</p>
        <form onSubmit={onSubmit}>
          <label style={s.label} htmlFor="raw">What&apos;s the problem?</label>
          <textarea id="raw" required minLength={3} maxLength={2000} rows={5} style={{ ...s.input, minHeight: "110px", resize: "vertical" }}
            placeholder="e.g. The kitchen tap in the shared kitchen won't stop dripping"
            value={raw} onChange={(e) => setRaw(e.target.value)} />
          <label style={s.label} htmlFor="reporter">Your name (optional)</label>
          <input id="reporter" type="text" maxLength={100} style={s.input}
            placeholder="So we know who to ask if we need more detail"
            value={reporter} onChange={(e) => setReporter(e.target.value)} />
          {error && <div style={s.errorBox}>{error}</div>}
          <button type="submit" style={s.submit} disabled={loading || raw.trim().length < 3}>{loading ? "Sending…" : "Send report"}</button>
        </form>
      </div>
    </main>
  );
}
