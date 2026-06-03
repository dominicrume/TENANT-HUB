/**
 * ChecklistTab — intake onboarding checklist with a progress bar. Each toggle
 * writes via the checklist API (writeWithAudit, H1). The two "After 3 days"
 * items have no DB column in the current schema, so they're shown disabled
 * (not yet tracked) rather than faking persistence.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { CHECKLIST_ITEMS, type ChecklistItem } from "@tenant-hub/validation";

type Row = { id: string | null; tenant_id: string } & Record<ChecklistItem, boolean>;

const LABELS: Record<ChecklistItem, string> = {
  housing_benefit_claim: "Housing Benefit Claim submitted",
  personal_details_form: "Personal Details Form completed",
  missing_person_form: "Missing Person Form completed",
  initial_assessment: "Initial Assessment carried out",
  service_charge_agreement: "Service Charge Agreement signed",
  confidentiality_form: "Confidentiality Form signed",
  risk_assessment: "Risk Assessment & Support Plan drafted",
  gp_registered: "GP/Doctor registered",
  uc_claim_progressed: "Universal Credit claim progressed",
  key_worker_assigned: "Key worker assigned",
};

const SECTIONS: { title: string; items: ChecklistItem[] }[] = [
  { title: "On Arrival", items: ["housing_benefit_claim", "personal_details_form", "missing_person_form", "initial_assessment", "service_charge_agreement", "confidentiality_form", "risk_assessment"] },
  { title: "Within 3 Days", items: ["gp_registered", "uc_claim_progressed", "key_worker_assigned"] },
];

export function ChecklistTab({ tenantId }: { tenantId: string }) {
  const [row, setRow] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/intake-checklists?tenantId=${tenantId}`);
    if (res.ok) setRow((await res.json()) as Row);
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const done = row ? CHECKLIST_ITEMS.filter((k) => row[k]).length : 0;
  const pct = Math.round((done / CHECKLIST_ITEMS.length) * 100);

  async function toggle(item: ChecklistItem) {
    if (!row || busy) return;
    setBusy(true);
    const next = !row[item];
    setRow({ ...row, [item]: next }); // optimistic
    if (row.id) {
      await fetch(`/api/intake-checklists/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [item]: next }),
      });
    } else {
      await fetch("/api/intake-checklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, [item]: next }),
      });
    }
    await load();
    setBusy(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Progress */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#7A8499", marginBottom: "4px" }}>
          <span>Intake completion</span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{pct}%</span>
        </div>
        <div style={{ height: "10px", borderRadius: "6px", background: "var(--navy)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--amber)", transition: "width 0.25s" }} />
        </div>
      </div>

      {/* Policy banner */}
      <div style={{ background: "rgba(52,200,122,0.10)", border: "1px solid rgba(52,200,122,0.25)", color: "#1E7F4F", borderRadius: "8px", padding: "10px 12px", fontSize: "12px" }}>
        All interaction with any resident must be recorded.
      </div>

      {SECTIONS.map((section) => (
        <div key={section.title}>
          <h3 style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--amber)", marginBottom: "8px" }}>
            {section.title}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {section.items.map((item) => (
              <label key={item} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", borderRadius: "8px", background: "var(--surface)", border: "1px solid #EDE8E1", cursor: "pointer", fontSize: "13px", color: "var(--navy)" }}>
                <input type="checkbox" checked={Boolean(row?.[item])} onChange={() => toggle(item)} disabled={busy} style={{ width: "18px", height: "18px", accentColor: "#E8A84C" }} />
                {LABELS[item]}
              </label>
            ))}
          </div>
        </div>
      ))}

      {/* After 3 days — not yet a tracked DB column (see component note) */}
      <div>
        <h3 style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--amber)", marginBottom: "8px" }}>
          After 3 Days (ongoing)
        </h3>
        {["First weekly review completed", "Council notified of placement"].map((l) => (
          <label key={l} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", borderRadius: "8px", background: "#F8F4EF", border: "1px solid #EDE8E1", fontSize: "13px", color: "#9AA6BC" }} title="Not yet tracked in the schema">
            <input type="checkbox" disabled style={{ width: "18px", height: "18px" }} />
            {l} <span style={{ fontSize: "11px" }}>(not yet tracked)</span>
          </label>
        ))}
      </div>
    </div>
  );
}
