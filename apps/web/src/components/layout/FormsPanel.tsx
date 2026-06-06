/**
 * FormsPanel — 280px right rail on the tenant detail page. Shows form-completion
 * status (from intake_checklists) and the form library; cards deep-link to the
 * relevant tab. Print Active Form + Eviction Notice live at the bottom.
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CanonicalTenant, ChecklistItem } from "@tenant-hub/validation";
import { EvictionNoticeModal } from "../EvictionNoticeModal";

interface FormCard {
  key: string;
  name: string;
  page: string;
  tint: string;
  tab?: string;
  checklist?: ChecklistItem;
}

const FORMS: FormCard[] = [
  { key: "personal", name: "Personal Details", page: "Page 3", tint: "#4C7CE8", tab: "personal", checklist: "personal_details_form" },
  { key: "hb", name: "Housing Benefit", page: "Page 1", tint: "#34C87A", tab: "personal", checklist: "housing_benefit_claim" },
  { key: "missing", name: "Missing Person", page: "Pages 5-6", tint: "#E8A84C", tab: "personal", checklist: "missing_person_form" },
  { key: "charge", name: "Service Charge", page: "Ledger", tint: "#0FB5A6", tab: "ledger", checklist: "service_charge_agreement" },
  { key: "risk", name: "Risk Assessment", page: "Page 7", tint: "#E05252", tab: "personal", checklist: "risk_assessment" },
  { key: "confidentiality", name: "Confidentiality", page: "Pages 6-7", tint: "#7C3AED", tab: "personal", checklist: "confidentiality_form" },
  { key: "initial", name: "Initial Assessment", page: "Page 8", tint: "#0F1C2E", tab: "personal", checklist: "initial_assessment" },
];

export function FormsPanel({ tenant }: { tenant: CanonicalTenant }) {
  const router = useRouter();
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [evictionOpen, setEvictionOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/intake-checklists?tenantId=${tenant.id}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => alive && setChecklist(d ?? {}))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tenant.id]);

  function statusBadge(form: FormCard) {
    const done = form.checklist ? Boolean(checklist[form.checklist]) : false;
    const txt = done ? "Done" : "Pending";
    const color = done ? "#1E7F4F" : "#7A8499";
    return <span style={{ fontSize: "10px", fontWeight: 700, color }}>{txt}</span>;
  }

  return (
    <aside className="forms-panel" style={{ width: "280px", flexShrink: 0, background: "var(--surface)", borderLeft: "1px solid #EDE8E1", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#7A8499" }}>Forms</span>
        
        <div style={{ background: "rgba(76,124,232,0.06)", border: "1px solid rgba(76,124,232,0.2)", borderRadius: "8px", padding: "10px", fontSize: "11px", color: "#4C7CE8", marginBottom: "6px", lineHeight: 1.4 }}>
          <strong>Unified Record:</strong> All forms below automatically pull and save data from the central Personal Details tab. No more re-entering names or DOBS!
        </div>

        {FORMS.map((f) => (
          <button
            key={f.key}
            onClick={() => f.tab && router.replace(`/tenants/${tenant.id}?tab=${f.tab}`)}
            style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 10px", borderRadius: "9px", border: "1px solid #EDE8E1", background: "#fff", cursor: f.tab ? "pointer" : "default", textAlign: "left" }}
          >
            <span style={{ width: "8px", height: "28px", borderRadius: "4px", background: f.tint, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--navy)" }}>{f.name}</span>
              <span style={{ display: "block", fontSize: "10px", color: "#9AA6BC" }}>{f.page}</span>
            </span>
            {statusBadge(f)}
          </button>
        ))}
      </div>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
        <button onClick={() => window.print()} style={{ minHeight: "44px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
          🖨 Print Active Form
        </button>
        <button onClick={() => setEvictionOpen(true)} style={{ minHeight: "44px", borderRadius: "8px", border: "1px solid rgba(224,82,82,0.3)", background: "rgba(224,82,82,0.06)", color: "#E05252", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
          ⚠️ Eviction Notice
        </button>
      </div>

      <EvictionNoticeModal tenant={tenant} open={evictionOpen} onClose={() => setEvictionOpen(false)} />
    </aside>
  );
}
