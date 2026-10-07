/**
 * Morning summary — the digest owner-digest writes to `documents` every day
 * (apps/worker/src/agents/owner-digest.ts, BUILD_PLAN C26), read back exactly
 * as it went out. Practice mode is badged, never hidden (H9).
 */
"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "../../../../lib/format";

interface Digest { id: string; title: string; body: string; is_simulated: boolean; created_at: string }

export default function MorningSummaryPage() {
  const [digest, setDigest] = useState<Digest | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/documents/latest?kind=digest")
      .then((r) => (r.ok ? r.json() : null))
      .then(setDigest)
      .catch(() => setDigest(null));
  }, []);

  return (
    <div style={{ padding: "1.75rem", maxWidth: 720 }}>
      <h1>Morning summary</h1>
      {digest === undefined ? (
        <p className="muted">Loading…</p>
      ) : digest === null ? (
        <p className="muted">No morning summary has been generated yet. It arrives with the worker&apos;s daily run.</p>
      ) : (
        <div className="card">
          <div className="ch">
            <h3>{digest.title}</h3>
            {digest.is_simulated && (
              <span className="tag" style={{ background: "rgba(232,168,76,.15)", color: "var(--amber-deep)" }}>Practice mode: no email actually sent</span>
            )}
          </div>
          <div className="li"><div className="body">
            <p style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{digest.body}</p>
            <p className="muted" style={{ marginTop: 10 }}>Generated {formatDateTime(digest.created_at)}</p>
          </div></div>
        </div>
      )}
    </div>
  );
}
