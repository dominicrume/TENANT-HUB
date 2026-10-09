/**
 * Referee page (migration 052) — opened from the reference-request email.
 * No account. Three options and a free-text box; the link works once.
 */
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import * as s from "../../_authStyles";

interface Info { kind: string; refereeName: string; tenantFirstName: string; orgName: string; answered: boolean }

const KIND_QUESTION: Record<string, string> = {
  previous_landlord: "Would you rent to them again?",
  employer: "Would you employ them again?",
  support_worker: "Would you recommend them for supported housing?",
  character: "Would you recommend them as a tenant?",
};

export default function ReferencePage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<"positive" | "negative" | "unable" | "">("");
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/reference/${token}`).then(async (r) => {
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "This link isn't valid."); return; }
      setInfo(b); if (b?.answered) setDone(true);
    }).catch(() => setError("Could not reach the server. Try again in a moment."));
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!decision) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/reference/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, response }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "Could not send your answer. Try again."); setBusy(false); return; }
      setDone(true);
    } catch { setError("Could not reach the server. Try again."); setBusy(false); }
  }

  const opt = (value: typeof decision, label: string) => (
    <label key={value} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", border: `1.5px solid ${decision === value ? "#E8A84C" : "#E9E1D4"}`, borderRadius: 10, marginBottom: 8, cursor: "pointer", background: decision === value ? "rgba(232,168,76,.08)" : "#fff" }}>
      <input type="radio" name="decision" value={value} checked={decision === value} onChange={() => setDecision(value)} />
      <span>{label}</span>
    </label>
  );

  return (
    <main style={s.page}>
      <div style={s.card}>
        <h1 style={s.heading}>Reference</h1>
        {!info && !error && <p style={s.subBrands}>Checking your link…</p>}
        {error && !info && <div style={s.errorBox}>{error}</div>}
        {info && done && (
          <>
            <p style={s.subBrands}>Thank you, {info.refereeName}. Your reference for {info.tenantFirstName} has been sent to {info.orgName}.</p>
            <p style={{ fontSize: 13, color: "#64748B" }}>You can close this page.</p>
          </>
        )}
        {info && !done && (
          <form onSubmit={onSubmit}>
            <p style={s.subBrands}>Hello {info.refereeName}. <strong>{info.orgName}</strong> is considering housing <strong>{info.tenantFirstName}</strong>, who gave your name as a referee. Your answer is seen only by the housing team.</p>
            <div style={{ fontWeight: 600, margin: "16px 0 8px", color: "#0F1C2E" }}>{KIND_QUESTION[info.kind] ?? "Would you recommend them?"}</div>
            {opt("positive", "Yes")}
            {opt("negative", "No")}
            {opt("unable", "I'm not able to say")}
            <label style={s.label} htmlFor="response">Anything else the team should know (optional)</label>
            <textarea id="response" rows={5} style={{ ...s.input, resize: "vertical", fontFamily: "inherit" }} value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Rent paid on time, condition of the room, how any problems were handled…" />
            {error && <div style={s.errorBox}>{error}</div>}
            <button type="submit" style={s.submit} disabled={busy || !decision}>{busy ? "Sending…" : "Send reference"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
