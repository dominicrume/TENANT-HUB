/**
 * /share/[token] — a file someone was sent a link to (docs/FILES_SPEC.md).
 * No account: the token is the credential; the link stops working on its
 * date or when withdrawn. Shows the file inline where the browser can, and
 * always offers Download.
 */
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import * as s from "../../(auth)/_authStyles";

interface Info { fileName: string; mimeType: string; size: number; label: string | null; expiresAt: string }

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/share/${token}?info=1`).then(async (r) => { const b = await r.json().catch(() => null); if (!r.ok) setError(b?.error ?? "This link isn't valid."); else setInfo(b); }).catch(() => setError("Could not reach the server."));
  }, [token]);

  const fileUrl = `/api/share/${token}`;
  const isImage = info?.mimeType.startsWith("image/");
  const isPdf = info?.mimeType === "application/pdf";
  return (
    <main style={{ ...s.page, alignItems: "flex-start", paddingTop: 32 }}>
      <div style={{ ...s.card, maxWidth: 900, width: "100%" }}>
        {!info && !error && <p style={s.subBrands}>Checking the link…</p>}
        {error && <><h1 style={s.heading}>Link not available</h1><div style={s.errorBox}>{error}</div></>}
        {info && (
          <>
            <h1 style={{ ...s.heading, fontSize: 20 }}>{info.label || info.fileName}</h1>
            <p style={s.subBrands}>{info.fileName} · {(info.size / 1024).toFixed(0)} KB · this link works until {new Date(info.expiresAt).toLocaleDateString("en-GB")}.</p>
            <div style={{ margin: "12px 0 16px", borderRadius: 12, overflow: "hidden", background: "#0F1C2E", minHeight: 200, display: "grid", placeItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- public share, no session, no optimizer */}
              {isImage ? <img src={fileUrl} alt={info.fileName} style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }} />
                : isPdf ? <iframe title={info.fileName} src={fileUrl} style={{ width: "100%", height: "70vh", border: "none", background: "#fff" }} />
                : <p style={{ color: "#CBD6E4", padding: 24 }}>This file type can&apos;t be shown here — download it below.</p>}
            </div>
            <a href={`${fileUrl}?download=1`} style={{ ...s.submit, display: "inline-block", textDecoration: "none", textAlign: "center" }}>Download</a>
            <p style={{ fontSize: 12, color: "#64748B", marginTop: 12 }}>Shared from Tenant Hub. If you weren&apos;t expecting this, ignore it — the link expires on its own.</p>
          </>
        )}
      </div>
    </main>
  );
}
