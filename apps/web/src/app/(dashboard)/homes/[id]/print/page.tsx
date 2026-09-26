/**
 * Print QR — one poster per home: a QR code for its wall report route
 * (/report/[propertyId], BUILD_PLAN C33) and the home's name underneath.
 * Generated entirely client-side (the `qrcode` package draws the code
 * locally; nothing is fetched to make it) so it works exactly the same
 * offline as it will in production.
 */
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function PrintQrPage() {
  const { id } = useParams<{ id: string }>();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [homeName, setHomeName] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/properties/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHomeName(d?.property?.name ?? null))
      .catch(() => setHomeName(null));
  }, [id]);

  useEffect(() => {
    const url = `${window.location.origin}/report/${id}`;
    void import("qrcode").then((QRCode) => QRCode.toDataURL(url, { width: 480, margin: 2 })).then(setDataUrl).catch(() => setDataUrl(null));
  }, [id]);

  return (
    <div style={{ padding: "2rem", textAlign: "center", maxWidth: 560, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>{homeName ?? "This home"}</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 24 }}>Scan to report a repair</p>
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUrl} alt={`QR code linking to the repair report form for ${homeName ?? "this home"}`} style={{ width: 320, height: 320 }} />
      ) : (
        <p className="muted">Generating…</p>
      )}
      <p style={{ marginTop: 24 }}>
        <button type="button" className="rel" onClick={() => window.print()}>Print</button>
      </p>
    </div>
  );
}
