/**
 * Step 3 — Staff review & confirm. Edit any field, then confirm: we compute the
 * canonical hash over the record (H4 anchor), record who/when, and advance to
 * the tenant verification portal.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RecordFields } from "../../../../../components/intake/RecordFields";
import { useAuth } from "../../../../../contexts/AuthContext";
import { hashRecord } from "../../../../../lib/hash";
import { canonicalSubset, type Draft } from "../../../../../lib/intake";

export default function ReviewPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const [data, setData] = useState<Record<string, unknown>>({});
  const [mode, setMode] = useState("manual");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/drafts/${draftId}`);
    if (res.ok) {
      const d = (await res.json()) as Draft;
      setData((d.machine_state?.extracted as Record<string, unknown>) ?? {});
      setMode(d.machine_state?.input_mode ?? "manual");
    }
  }, [draftId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirm() {
    setBusy(true);
    const hash = await hashRecord(canonicalSubset(data));
    await fetch(`/api/drafts/${draftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        machine_state: {
          input_mode: mode,
          extracted: data,
          confirmed_by: profile?.id,
          confirmed_at: new Date().toISOString(),
        },
        step: 3,
        canonical_hash: hash,
      }),
    });
    router.push(`/intake/${draftId}/verify`);
  }

  return (
    <div>
      <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--navy)", marginBottom: "6px" }}>Review &amp; confirm</h1>
      <p style={{ fontSize: "12px", color: "#7A8499", marginBottom: "16px" }}>
        Confirming as: <strong style={{ color: "var(--navy)" }}>{profile?.full_name ?? "—"}</strong> · {profile?.role?.replace("_", " ")}
      </p>

      <RecordFields data={data} onChange={(k, v) => setData((d) => ({ ...d, [k]: v }))} />

      {/* Blockchain stamp preview */}
      <div style={{ marginTop: "18px", background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.25)", borderRadius: "10px", padding: "12px 14px", fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "#4B2E83" }}>
        <div>⛓ Will be recorded on confirm:</div>
        <div>Entered by: {profile?.full_name ?? "—"}</div>
        <div>Method: {mode}</div>
        <div>Hash preview: will be computed on confirm</div>
      </div>

      <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
        <button onClick={confirm} disabled={busy}
          style={{ minHeight: "56px", padding: "0 24px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          {busy ? "Confirming…" : "Confirm & Continue →"}
        </button>
      </div>
    </div>
  );
}
