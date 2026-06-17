/**
 * ChecklistTab — gamified intake onboarding checklist ("Quest Board").
 * Each toggle writes via the checklist API (writeWithAudit, H1).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { CHECKLIST_ITEMS, type ChecklistItem } from "@tenant-hub/validation";

type Row = { id: string | null; tenant_id: string } & Record<ChecklistItem, boolean>;

const LABELS: Record<ChecklistItem, { title: string; desc: string }> = {
  housing_benefit_claim: { title: "Housing Benefit Claim", desc: "Submit the primary HB application." },
  personal_details_form: { title: "Personal Details", desc: "Complete the master personal info record." },
  missing_person_form: { title: "Missing Person", desc: "Ensure emergency contact protocols are set." },
  initial_assessment: { title: "Initial Assessment", desc: "Conduct the first 1-on-1 needs evaluation." },
  service_charge_agreement: { title: "Service Charge Agreement", desc: "Sign the weekly utilities & support agreement." },
  confidentiality_form: { title: "Confidentiality", desc: "Sign the data protection & privacy consent." },
  risk_assessment: { title: "Risk Assessment & Support Plan", desc: "Draft the core support and risk management plan." },
  gp_registered: { title: "GP Registration", desc: "Ensure the tenant is registered with a local doctor." },
  uc_claim_progressed: { title: "Universal Credit", desc: "Progress or verify the UC claim status." },
  key_worker_assigned: { title: "Key Worker Assignment", desc: "Assign a dedicated support worker to the tenant." },
};

const SECTIONS: { title: string; items: ChecklistItem[] }[] = [
  { title: "Stage 1: On Arrival", items: ["housing_benefit_claim", "personal_details_form", "missing_person_form", "initial_assessment", "service_charge_agreement", "confidentiality_form", "risk_assessment"] },
  { title: "Stage 2: Within 3 Days", items: ["gp_registered", "uc_claim_progressed", "key_worker_assigned"] },
];

export function ChecklistTab({ tenantId }: { tenantId: string }) {
  const [row, setRow] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState<string | null>(null);

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
    
    // Trigger celebration animation if checking it off
    if (next) {
      setCelebrate(item);
      setTimeout(() => setCelebrate(null), 1000);
    }

    setRow({ ...row, [item]: next }); // optimistic
    
    try {
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
    } catch (e) {
      // rollback on error
      setRow({ ...row, [item]: !next });
    }
    setBusy(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", paddingBottom: "40px" }}>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pop {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        @keyframes pulseGlow {
          0% { box-shadow: 0 0 0 0 rgba(52, 200, 122, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(52, 200, 122, 0); }
          100% { box-shadow: 0 0 0 0 rgba(52, 200, 122, 0); }
        }
        .mission-card {
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        .mission-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px -4px rgba(0,0,0,0.05);
        }
        .checkbox-ring {
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
      `}} />

      {/* Gamified Progress Header */}
      <div style={{ background: "linear-gradient(135deg, var(--navy) 0%, #1a2942 100%)", borderRadius: "16px", padding: "24px", color: "white", position: "relative", overflow: "hidden", boxShadow: "0 10px 25px -5px rgba(15, 28, 46, 0.3)" }}>
        <div style={{ position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "12px" }}>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Intake Quests</h2>
              <p style={{ fontSize: "13px", color: "#9AA6BC", margin: "4px 0 0 0" }}>Complete all missions to fully onboard the tenant.</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: "32px", fontWeight: 800, color: "var(--amber)", lineHeight: 1 }}>{pct}%</span>
              <span style={{ display: "block", fontSize: "11px", color: "#9AA6BC", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, marginTop: "4px" }}>XP Level</span>
            </div>
          </div>
          <div style={{ height: "12px", borderRadius: "8px", background: "rgba(255,255,255,0.1)", overflow: "hidden", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #E8A84C 0%, #F6C879 100%)", transition: "width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)", borderRadius: "8px" }} />
          </div>
        </div>
        {/* Decorative background shapes */}
        <div style={{ position: "absolute", top: "-20px", right: "-20px", width: "150px", height: "150px", background: "radial-gradient(circle, rgba(232,168,76,0.15) 0%, rgba(232,168,76,0) 70%)", borderRadius: "50%" }} />
      </div>

      {SECTIONS.map((section, idx) => (
        <div key={section.title}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <div style={{ width: "24px", height: "24px", borderRadius: "6px", background: "var(--amber)", color: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 800 }}>
              {idx + 1}
            </div>
            <h3 style={{ fontSize: "15px", fontWeight: 800, color: "var(--navy)", letterSpacing: "-0.01em", margin: 0 }}>
              {section.title}
            </h3>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {section.items.map((item) => {
              const isDone = Boolean(row?.[item]);
              const isCelebrating = celebrate === item;
              
              return (
                <div 
                  key={item} 
                  className="mission-card"
                  onClick={() => toggle(item)}
                  style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "16px", 
                    padding: "16px", 
                    borderRadius: "12px", 
                    background: isDone ? "#F4FDF8" : "var(--surface)", 
                    border: isDone ? "1px solid rgba(52, 200, 122, 0.3)" : "1px solid #EDE8E1", 
                    cursor: busy ? "wait" : "pointer",
                    opacity: busy && !isCelebrating ? 0.7 : 1
                  }}
                >
                  <div 
                    className="checkbox-ring"
                    style={{ 
                      width: "28px", 
                      height: "28px", 
                      borderRadius: "50%", 
                      border: isDone ? "none" : "2px solid #CBD5E1", 
                      background: isDone ? "#34C87A" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      flexShrink: 0,
                      animation: isCelebrating ? "pop 0.4s ease-out, pulseGlow 1s ease-out" : "none"
                    }}
                  >
                    {isDone && (
                      <svg width="14" height="10" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontSize: "14px", 
                      fontWeight: 700, 
                      color: isDone ? "#1E7F4F" : "var(--navy)",
                      textDecoration: isDone ? "line-through" : "none",
                      transition: "all 0.3s ease"
                    }}>
                      {LABELS[item].title}
                    </div>
                    <div style={{ 
                      fontSize: "12px", 
                      color: isDone ? "#34C87A" : "#7A8499",
                      marginTop: "2px" 
                    }}>
                      {LABELS[item].desc}
                    </div>
                  </div>
                  
                  {isDone && (
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#34C87A", background: "rgba(52,200,122,0.1)", padding: "4px 8px", borderRadius: "12px", animation: isCelebrating ? "pop 0.4s ease-out" : "none" }}>
                      +50 XP
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Ongoing quests */}
      <div>
         <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <div style={{ width: "24px", height: "24px", borderRadius: "6px", background: "#E2E8F0", color: "#64748B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 800 }}>
              ∞
            </div>
            <h3 style={{ fontSize: "15px", fontWeight: 800, color: "#64748B", letterSpacing: "-0.01em", margin: 0 }}>
              Ongoing Quests
            </h3>
          </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {[
            { title: "First weekly review completed", desc: "Conduct the mandatory 7-day check-in." },
            { title: "Council notified of placement", desc: "Inform the local council of new tenancy." }
          ].map((l) => (
            <div key={l.title} style={{ display: "flex", alignItems: "center", gap: "16px", padding: "16px", borderRadius: "12px", background: "#F8F9FA", border: "1px dashed #CBD5E1", opacity: 0.7 }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid #CBD5E1", background: "transparent", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#64748B" }}>{l.title}</div>
                <div style={{ fontSize: "12px", color: "#94A3B8", marginTop: "2px" }}>{l.desc}</div>
              </div>
              <div style={{ marginLeft: "auto", fontSize: "10px", fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Locked
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
