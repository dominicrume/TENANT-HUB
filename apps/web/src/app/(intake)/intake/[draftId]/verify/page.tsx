/**
 * Step 4 — Tenant verification portal. Simplified, large fonts, tablet-friendly.
 * The tenant reads their details and signs. On confirm we RECOMPUTE the canonical
 * hash and assert it equals the Step-3 hash (H4). Mismatch → reject.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RecordFields } from "../../../../../components/intake/RecordFields";
import { hashRecord } from "../../../../../lib/hash";
import { canonicalSubset, type Draft } from "../../../../../lib/intake";
import { DigitalSignaturePad } from "../../../../../components/form/DigitalSignaturePad";

export default function VerifyPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [signatureData, setSignatureData] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/drafts/${draftId}`, { cache: "no-store" });
    if (res.ok) setDraft((await res.json()) as Draft);
  }, [draftId]);

  useEffect(() => {
    void load();
  }, [load]);

  const data = (draft?.machine_state?.extracted as Record<string, unknown>) ?? {};

  const [needsReview, setNeedsReview] = useState(false);

  async function confirm() {
    if (!draft) return;

    // A signature is required — no blank/invisible sign-off gets written to a
    // tenant's record. The button is also disabled without one (belt and braces).
    if (!signatureData) {
      setError("Please sign before confirming.");
      return;
    }

    setBusy(true);
    setError(null);
    setNeedsReview(false);
    try {
      // H4: the record the tenant just read must be byte-for-byte what staff
      // reviewed at Step 3 — recompute the same canonical hash and refuse to
      // attach a signature to anything that has since changed.
      const recomputed = await hashRecord(canonicalSubset(data));
      if (recomputed !== draft.canonical_hash) {
        setError("This record has changed since it was last reviewed, so it can't be signed as-is. Go back and review it again.");
        setNeedsReview(true);
        setBusy(false);
        return;
      }
      const res = await fetch(`/api/drafts/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machine_state: { ...draft.machine_state, signature: { dataUrl: signatureData, date } },
          step: 4,
        }),
      });

      if (!res.ok) {
        const b = await res.json().catch(() => null);
        setError(b?.error ?? "Failed to save signature");
        setBusy(false);
        return;
      }

      router.push(`/intake/${draftId}/complete`);
    } catch (err: any) {
      setError(err?.message ?? "An unexpected error occurred.");
      setBusy(false);
    }
  }

  if (!draft) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "200px", color: "var(--navy)" }}>
        Loading draft details...
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--navy)", marginBottom: "16px" }}>
        Please read your details carefully.
      </h1>

      <RecordFields data={data} readOnly large />

      <div style={{ marginTop: "22px", borderTop: "1px solid #EDE8E1", paddingTop: "18px" }}>
        <p style={{ fontSize: "16px", color: "var(--navy)", marginBottom: "12px" }}>
          I confirm these details are accurate.
        </p>
        
        <div style={{ maxWidth: "420px", marginBottom: "16px" }}>
          <DigitalSignaturePad
            label="Type your full name below to sign"
            value={signatureData}
            onChange={(base64, dt) => {
              setSignatureData(base64);
              if (dt) setDate(dt);
            }}
          />
        </div>

        {error && (
          <div style={{ color: "#E05252", fontSize: "14px", marginTop: "12px" }}>
            {error}
            {needsReview && (
              <>
                {" "}
                <button onClick={() => router.push(`/intake/${draftId}/review`)}
                  style={{ border: "none", background: "none", color: "#E05252", fontWeight: 700, textDecoration: "underline", cursor: "pointer", padding: 0, font: "inherit" }}>
                  Go to review
                </button>
              </>
            )}
          </div>
        )}

        <div className="no-print" style={{ display: "flex", gap: "12px", marginTop: "18px", flexWrap: "wrap" }}>
          <button onClick={confirm} disabled={busy || !signatureData}
            style={{ flex: "1 1 240px", minHeight: "56px", borderRadius: "8px", border: "none", background: "var(--amber)", color: "var(--navy)", fontWeight: 700, fontSize: "16px", opacity: busy || !signatureData ? 0.5 : 1, cursor: busy || !signatureData ? "not-allowed" : "pointer" }}>
            {busy ? "Processing..." : "✓ Confirm & Sign"}
          </button>
          <button onClick={() => window.print()}
            style={{ minHeight: "56px", padding: "0 20px", borderRadius: "8px", border: "1px solid #38bdf8", background: "#f0f9ff", color: "#0ea5e9", fontWeight: 600, cursor: "pointer" }}>
            🖨️ Print Form
          </button>
          <button onClick={() => router.push(`/intake/${draftId}/review`)}
            style={{ minHeight: "56px", padding: "0 20px", borderRadius: "8px", border: "1px solid #EDE8E1", background: "#fff", color: "#7A8499", fontWeight: 600, cursor: "pointer" }}>
            ✗ Something is wrong
          </button>
        </div>
      </div>
    </div>
  );
}

