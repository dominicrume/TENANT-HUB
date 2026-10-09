/**
 * Landlord upload page (migration 052) — what the "Upload the document"
 * button in a document-request email opens. No account, no login: the token
 * in the URL is the whole credential, and it works once.
 */
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import * as s from "../../_authStyles";

interface Info { documentType: string; property: string; landlord: string | null; done: boolean }

export default function LandlordUploadPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/landlord-upload/${token}`).then(async (r) => {
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "This link isn't valid."); return; }
      setInfo(b); if (b?.done) setDone(true);
    }).catch(() => setError("Could not reach the server. Try again in a moment."));
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setError(null);
    const fd = new FormData(); fd.append("file", file);
    try {
      const r = await fetch(`/api/landlord-upload/${token}`, { method: "POST", body: fd });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "Upload failed. Try again."); setBusy(false); return; }
      setDone(true);
    } catch { setError("Could not reach the server. Try again."); setBusy(false); }
  }

  return (
    <main style={s.page}>
      <div style={s.card}>
        <h1 style={s.heading}>Upload a document</h1>
        {!info && !error && <p style={s.subBrands}>Checking your link…</p>}
        {error && !info && <div style={s.errorBox}>{error}</div>}
        {info && done && (
          <>
            <p style={s.subBrands}>Thank you{info.landlord ? `, ${info.landlord}` : ""}. The <strong>{info.documentType}</strong> for <strong>{info.property}</strong> has been received and filed.</p>
            <p style={{ fontSize: 13, color: "#64748B" }}>You can close this page.</p>
          </>
        )}
        {info && !done && (
          <form onSubmit={onSubmit}>
            <p style={s.subBrands}>
              {info.landlord ? `Hello ${info.landlord}. ` : ""}Please upload the <strong>{info.documentType}</strong> for <strong>{info.property}</strong>. PDF or photo, up to 15MB.
            </p>
            <label style={s.label} htmlFor="file">File</label>
            <input id="file" type="file" required accept="application/pdf,image/*" style={{ ...s.input, padding: 10 }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {error && <div style={s.errorBox}>{error}</div>}
            <button type="submit" style={s.submit} disabled={busy || !file}>{busy ? "Uploading…" : "Send the document"}</button>
            <p style={{ fontSize: 12, color: "#64748B", marginTop: 10 }}>This link works once. Nothing else about you or the property is shown here.</p>
          </form>
        )}
      </div>
    </main>
  );
}
