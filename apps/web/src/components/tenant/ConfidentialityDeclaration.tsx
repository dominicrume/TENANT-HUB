/**
 * ConfidentialityDeclaration — the tenant's consent to Ash Shahada holding
 * and sharing their data. Was a "Date Signed" input hardcoded to an empty
 * value with a no-op handler (BUILD_PLAN feedback, 2026-09-27) — it could
 * never be typed into, matching the report that tapping it did nothing.
 *
 * Fixed by tying it to the SAME confidentiality_form flag FormsPanel already
 * reads from intake_checklists, instead of inventing a second, disconnected
 * place this fact could be recorded — a person confirms it was signed, the
 * date comes from when that happened (intake_checklists.updated_at), not a
 * hand-typed date nobody can verify.
 */
"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "../../lib/format";

interface ChecklistRow { id: string | null; confidentiality_form?: boolean; updated_at?: string }

export function ConfidentialityDeclaration({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [checklistId, setChecklistId] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/intake-checklists?tenantId=${tenantId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ChecklistRow | null) => {
        if (!d) return;
        setChecklistId(d.id);
        setSigned(Boolean(d.confidentiality_form));
        setSignedAt(d.updated_at ?? null);
      })
      .catch(() => {});
  }, [tenantId]);

  async function toggle() {
    const next = !signed;
    setBusy(true);
    const res = checklistId
      ? await fetch(`/api/intake-checklists/${checklistId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confidentiality_form: next }) })
      : await fetch(`/api/intake-checklists`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant_id: tenantId, confidentiality_form: next }) });
    setBusy(false);
    if (!res.ok) return;
    const d = (await res.json()) as ChecklistRow;
    setChecklistId(d.id);
    setSigned(Boolean(d.confidentiality_form));
    setSignedAt(d.updated_at ?? null);
  }

  return (
    <section id="confidentiality" style={{ marginBottom: "22px" }}>
      <h3 style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--amber)", marginBottom: "10px", borderBottom: "1px solid #EDE8E1", paddingBottom: "5px" }}>
        6 · Confidentiality declaration
      </h3>
      <p style={{ fontSize: "12px", color: "#445", lineHeight: 1.6, background: "#F8F4EF", padding: "12px", borderRadius: "8px" }}>
        I authorise Ash Shahada Housing Association Ltd to hold and process my personal
        information for the purposes of providing housing and support services, and to share
        it with relevant agencies (local authority, DWP, healthcare and probation services)
        where necessary for my support and statutory obligations. Information will be held
        securely and in accordance with the Data Protection Act 2018 and UK GDPR.
      </p>
      <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, fontSize: 13, color: "var(--navy)", cursor: "pointer" }}>
        <input type="checkbox" checked={signed} disabled={busy} onChange={() => void toggle()} style={{ width: 18, height: 18 }} />
        <span>
          <b>{tenantName || "This tenant"}</b> has signed this declaration
          {signed && signedAt ? ` — confirmed ${formatDateTime(signedAt)}` : ""}
        </span>
      </label>
      <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--navy)", fontWeight: 600 }}>
        On behalf of Ash Shahada Housing Association Ltd — AHSAN REHMAN
      </div>
    </section>
  );
}
