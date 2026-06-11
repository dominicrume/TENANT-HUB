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
import { TenantCreateSchema } from "@tenant-hub/validation";
import { canonicalSubset, type Draft } from "../../../../../lib/intake";

export default function ReviewPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [data, setData] = useState<Record<string, unknown>>({});
  const [mode, setMode] = useState("manual");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/drafts/${draftId}`, { cache: "no-store" });
    if (res.ok) {
      const d = (await res.json()) as Draft;
      setData((d.machine_state?.extracted as Record<string, unknown>) ?? {});
      setMode(d.machine_state?.input_mode ?? "manual");
    }
    setLoaded(true);
  }, [draftId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirm() {
    setBusy(true);
    setValidationErrors([]);

    const formSchema = TenantCreateSchema.omit({ brand: true, entry_method: true });
    const parsed = formSchema.safeParse(data);
    
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      setValidationErrors(issues);
      setBusy(false);
      return;
    }

    const hash = await hashRecord(canonicalSubset(data));
    const res = await fetch(`/api/drafts/${draftId}`, {
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
    
    if (!res.ok) {
      alert("Failed to save draft. Please try again.");
      setBusy(false);
      return;
    }
    
    router.push(`/intake/${draftId}/verify`);
  }

  if (!loaded || authLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "200px", color: "var(--navy)" }}>
        Loading draft details...
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--navy)", marginBottom: "6px" }}>Review &amp; confirm</h1>
      <p style={{ fontSize: "12px", color: "#7A8499", marginBottom: "16px" }}>
        Confirming as: <strong style={{ color: "var(--navy)" }}>{profile?.full_name || profile?.email || "—"}</strong> · {profile?.role?.replace("_", " ")}
      </p>

      <RecordFields data={data} onChange={(k, v) => setData((d) => ({ ...d, [k]: v }))} />

      {/* Blockchain stamp preview */}
      <div style={{ marginTop: "18px", background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.25)", borderRadius: "10px", padding: "12px 14px", fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "#4B2E83" }}>
        <div>⛓ Will be recorded on confirm:</div>
        <div>Entered by: {profile?.full_name || profile?.email || "—"}</div>
        <div>Method: {mode}</div>
        <div>Hash preview: will be computed on confirm</div>
      </div>

      {validationErrors.length > 0 && (
        <div style={{ marginTop: "18px", padding: "12px", background: "#FEF2F2", border: "1px solid #F87171", borderRadius: "8px", color: "#B91C1C", fontSize: "14px" }}>
          <strong style={{ display: "block", marginBottom: "8px" }}>Please fix the following issues:</strong>
          <ul style={{ margin: 0, paddingLeft: "20px" }}>
            {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
        <button onClick={confirm} disabled={busy}
          style={{ minHeight: "56px", padding: "0 24px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          {busy ? "Confirming…" : "Confirm & Continue →"}
        </button>
      </div>
    </div>
  );
}
