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

export default function VerifyPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [name, setName] = useState("");
  const [date] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/drafts/${draftId}`);
    if (res.ok) setDraft((await res.json()) as Draft);
  }, [draftId]);

  useEffect(() => {
    void load();
  }, [load]);

  const data = (draft?.machine_state?.extracted as Record<string, unknown>) ?? {};

  async function confirm() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    // H4 — recompute the canonical hash and assert it matches Step 3's hash.
    const recomputed = await hashRecord(canonicalSubset(data));
    if (recomputed !== draft.canonical_hash) {
      setError("Record changed since review. Please ask staff to restart.");
      setBusy(false);
      return;
    }
    await fetch(`/api/drafts/${draftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        machine_state: { ...draft.machine_state, signature: { name, date } },
        step: 4,
      }),
    });
    router.push(`/intake/${draftId}/complete`);
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
        <label style={{ display: "block", fontSize: "13px", color: "#7A8499", marginBottom: "6px" }}>Type your full name to sign</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          style={{ width: "100%", maxWidth: "420px", minHeight: "56px", padding: "12px", borderRadius: "8px", border: "1px solid #EDE8E1", fontSize: "18px", boxSizing: "border-box" }} />
        <div style={{ fontSize: "13px", color: "#7A8499", marginTop: "8px", fontFamily: "'JetBrains Mono',monospace" }}>Date: {date}</div>

        {error && <div style={{ color: "#E05252", fontSize: "14px", marginTop: "12px" }}>{error}</div>}

        <div className="no-print" style={{ display: "flex", gap: "12px", marginTop: "18px", flexWrap: "wrap" }}>
          <button onClick={confirm} disabled={busy || !name.trim()}
            style={{ flex: "1 1 240px", minHeight: "56px", borderRadius: "8px", border: "none", background: "var(--amber)", color: "var(--navy)", fontWeight: 700, fontSize: "16px", cursor: busy || !name.trim() ? "not-allowed" : "pointer" }}>
            ✓ Confirm &amp; Sign
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
