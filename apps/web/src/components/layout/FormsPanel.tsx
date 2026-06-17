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
  { key: "personal", name: "Personal Details", page: "Quest 1", tint: "#4C7CE8", tab: "personal", checklist: "personal_details_form" },
  { key: "hb", name: "Housing Benefit", page: "Quest 2", tint: "#34C87A", tab: "hb", checklist: "housing_benefit_claim" },
  { key: "missing", name: "Missing Person", page: "Quest 3", tint: "#E8A84C", tab: "missing", checklist: "missing_person_form" },
  { key: "charge", name: "Service Charge", page: "Quest 4", tint: "#0FB5A6", tab: "ledger", checklist: "service_charge_agreement" },
  { key: "risk", name: "Risk Assessment", page: "Quest 5", tint: "#E05252", tab: "risk", checklist: "risk_assessment" },
  { key: "confidentiality", name: "Confidentiality", page: "Quest 6", tint: "#7C3AED", tab: "personal", checklist: "confidentiality_form" },
  { key: "initial", name: "Initial Assessment", page: "Quest 7", tint: "#0F1C2E", tab: "initial", checklist: "initial_assessment" },
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
    
    if (done) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "50%", background: "linear-gradient(135deg, #34C87A 0%, #1E7F4F 100%)", color: "white", boxShadow: "0 2px 5px rgba(52,200,122,0.3)" }}>
          <svg width="12" height="9" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg">
             <path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      );
    }
    
    return (
      <div style={{ padding: "4px 8px", borderRadius: "8px", background: "#F1F5F9", color: "#94A3B8", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Locked
      </div>
    );
  }

  return (
    <aside className="forms-panel" style={{ width: "280px", flexShrink: 0, background: "var(--surface)", borderLeft: "1px solid #EDE8E1", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
           <span style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--navy)" }}>Quest Log</span>
           <span style={{ fontSize: "18px" }}>📜</span>
        </div>
        
        <div style={{ background: "linear-gradient(to right, rgba(76,124,232,0.06), rgba(76,124,232,0.02))", borderLeft: "3px solid #4C7CE8", borderRadius: "4px", padding: "10px 12px", fontSize: "11px", color: "#4C7CE8", marginBottom: "8px", lineHeight: 1.4 }}>
          <strong>Pro Tip:</strong> Completing forms here will unlock achievements in the Checklist tab!
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {FORMS.map((f) => {
            const isDone = f.checklist ? Boolean(checklist[f.checklist]) : false;
            
            return (
              <button
                key={f.key}
                onClick={() => {
                  if (f.key === "confidentiality") {
                    router.replace(`/tenants/${tenant.id}?tab=personal#confidentiality`);
                    setTimeout(() => {
                      document.getElementById("confidentiality")?.scrollIntoView({ behavior: "smooth" });
                    }, 100);
                  } else if (f.tab) {
                    router.replace(`/tenants/${tenant.id}?tab=${f.tab}`);
                  }
                }}
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "10px", 
                  padding: "10px", 
                  borderRadius: "10px", 
                  border: isDone ? "1px solid rgba(52,200,122,0.3)" : "1px solid #E2E8F0", 
                  background: isDone ? "#F4FDF8" : "#fff", 
                  cursor: f.tab ? "pointer" : "default", 
                  textAlign: "left",
                  transition: "transform 0.2s, box-shadow 0.2s"
                }}
                onMouseOver={(e) => {
                  if (f.tab) {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0,0,0,0.05)";
                  }
                }}
                onMouseOut={(e) => {
                  if (f.tab) {
                    e.currentTarget.style.transform = "none";
                    e.currentTarget.style.boxShadow = "none";
                  }
                }}
              >
                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: `${f.tint}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: f.tint }} />
                </div>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "13px", fontWeight: 600, color: isDone ? "#1E7F4F" : "var(--navy)" }}>{f.name}</span>
                  <span style={{ display: "block", fontSize: "10px", color: isDone ? "#34C87A" : "#94A3B8" }}>{f.page}</span>
                </span>
                {statusBadge(f)}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "8px", paddingTop: "16px", borderTop: "1px dashed #E2E8F0" }}>
        <button onClick={() => window.print()} style={{ minHeight: "44px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", fontWeight: 600, fontSize: "13px", cursor: "pointer", transition: "background 0.2s" }} onMouseOver={e => e.currentTarget.style.background = "#0F1C2E"} onMouseOut={e => e.currentTarget.style.background = "var(--navy)"}>
          🖨 Print Active Form
        </button>
        <button onClick={() => setEvictionOpen(true)} style={{ minHeight: "44px", borderRadius: "8px", border: "1px solid rgba(224,82,82,0.3)", background: "rgba(224,82,82,0.06)", color: "#E05252", fontWeight: 600, fontSize: "13px", cursor: "pointer", transition: "background 0.2s" }} onMouseOver={e => e.currentTarget.style.background = "rgba(224,82,82,0.1)"} onMouseOut={e => e.currentTarget.style.background = "rgba(224,82,82,0.06)"}>
          ⚠️ Eviction Notice
        </button>
      </div>

      <EvictionNoticeModal tenant={tenant} open={evictionOpen} onClose={() => setEvictionOpen(false)} />
    </aside>
  );
}
