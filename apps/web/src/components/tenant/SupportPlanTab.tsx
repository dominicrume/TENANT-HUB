"use client";

import { useEffect, useState, useCallback } from "react";
import { CanonicalTenant } from "@tenant-hub/validation";
import { SUPPORT_PLAN_PRESETS, SupportPlan, SupportPlanObjective } from "@tenant-hub/validation";

export function SupportPlanTab({ tenantId, tenant }: { tenantId: string; tenant?: CanonicalTenant }) {
  const [data, setData] = useState<SupportPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/tenants/${tenantId}/forms`);
    if (res.ok) {
      const forms = await res.json();
      const match = forms.find((f: any) => f.template_id === "reliance-support-plan");
      
      if (match && match.data && Object.keys(match.data).length > 0) {
        setData(match.data as SupportPlan);
      } else if (tenant) {
        // Auto-populate for the first time
        const initialPlan: SupportPlan = {
          tenant_id: tenantId,
          initial_date: new Date().toISOString().slice(0, 10),
          review_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // 3 months
          support_workers: ["Staff"], // Could pull from assigned workers if we had that field
          categories: SUPPORT_PLAN_PRESETS.map(preset => ({
            category: preset.category,
            objectives: preset.objectives.map(obj => ({
              id: obj.id,
              title: obj.title,
              active: false,
              steps: obj.steps.map(step => ({
                description: step,
                completed: false,
              })),
              comments: "",
            })),
          })),
        };
        setData(initialPlan);
      }
    }
    setLoading(false);
  }, [tenantId, tenant]);

  useEffect(() => { void load(); }, [load]);

  async function onSave() {
    if (!data) return;
    setSaving(true);
    setSaveMsg(null);
    const res = await fetch(`/api/tenants/${tenantId}/forms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: "reliance-support-plan", data }),
    });
    setSaving(false);
    if (!res.ok) {
      setSaveMsg("✗ Save failed");
      return;
    }
    setSaveMsg(`✓ Saved — ${new Date().toLocaleTimeString("en-GB")}`);
  }

  function updateObjective(catIdx: number, objIdx: number, updater: (obj: SupportPlanObjective) => SupportPlanObjective) {
    if (!data) return;
    const newData = { ...data };
    newData.categories[catIdx].objectives[objIdx] = updater({ ...newData.categories[catIdx].objectives[objIdx] });
    setData(newData);
  }

  if (loading || !data) return <div style={{ padding: "40px", color: "#7A8499" }}>Loading Support Plan...</div>;

  return (
    <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "24px" }}>
      
      {/* HEADER SECTION */}
      <div style={{ background: "#F8F4EF", padding: "20px", borderRadius: "12px", border: "1px solid #EDE8E1" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--navy)", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Support Plan Header</h3>
        
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#7A8499", marginBottom: "6px" }}>Tenant Name</label>
            <input type="text" value={tenant?.full_name || ""} disabled style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #D9D2C7", fontSize: "13px", background: "#f1f1f1" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#7A8499", marginBottom: "6px" }}>Support Workers</label>
            <input type="text" value={data.support_workers.join(", ")} onChange={(e) => setData({...data, support_workers: e.target.value.split(",").map(s => s.trim())})} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #D9D2C7", fontSize: "13px" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#7A8499", marginBottom: "6px" }}>Initial Plan Date</label>
            <input type="date" value={data.initial_date} onChange={(e) => setData({...data, initial_date: e.target.value})} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #D9D2C7", fontSize: "13px" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#7A8499", marginBottom: "6px" }}>Next Review Due Date</label>
            <input type="date" value={data.review_date} onChange={(e) => setData({...data, review_date: e.target.value})} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #D9D2C7", fontSize: "13px", fontWeight: 700, color: "var(--amber)" }} />
          </div>
        </div>
      </div>

      {/* CATEGORIES & OBJECTIVES */}
      {data.categories.map((cat, catIdx) => (
        <div key={cat.category} style={{ border: "1px solid #EDE8E1", borderRadius: "12px", overflow: "hidden" }}>
          <div style={{ background: "var(--navy)", padding: "16px", color: "#fff" }}>
            <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>{cat.category}</h4>
          </div>
          
          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
            {cat.objectives.map((obj, objIdx) => (
              <div key={obj.id} style={{ border: "1px solid #E2E8F0", borderRadius: "8px", overflow: "hidden" }}>
                {/* Objective Header Toggle */}
                <div 
                  onClick={() => updateObjective(catIdx, objIdx, (o) => ({...o, active: !o.active}))}
                  style={{ background: obj.active ? "#F0FDF4" : "#F8FAFC", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <input type="checkbox" checked={obj.active} readOnly style={{ width: "18px", height: "18px", cursor: "pointer" }} />
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--navy)" }}>{obj.title}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: obj.active ? "#1E7F4F" : "#94A3B8", fontWeight: 600 }}>
                    {obj.active ? "ACTIVE GOAL" : "INACTIVE"}
                  </div>
                </div>

                {/* Objective Steps (only show if active) */}
                {obj.active && (
                  <div style={{ padding: "16px", borderTop: "1px solid #E2E8F0", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div>
                      <h5 style={{ fontSize: "12px", color: "#7A8499", textTransform: "uppercase", marginBottom: "10px", fontWeight: 600 }}>Action Steps</h5>
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {obj.steps.map((step, stepIdx) => (
                          <div key={stepIdx} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "10px", background: "#F8FAFC", borderRadius: "6px" }}>
                            <input 
                              type="checkbox" 
                              checked={step.completed} 
                              onChange={(e) => updateObjective(catIdx, objIdx, (o) => {
                                const newSteps = [...o.steps];
                                newSteps[stepIdx].completed = e.target.checked;
                                if (e.target.checked && !newSteps[stepIdx].completed_date) {
                                  newSteps[stepIdx].completed_date = new Date().toISOString().slice(0, 10);
                                  newSteps[stepIdx].signed_by = "Staff"; // Mock signed by
                                }
                                return {...o, steps: newSteps};
                              })}
                              style={{ width: "16px", height: "16px", marginTop: "2px", cursor: "pointer" }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: "13px", color: step.completed ? "#94A3B8" : "var(--navy)", textDecoration: step.completed ? "line-through" : "none" }}>
                                {step.description}
                              </div>
                              {step.completed && (
                                <div style={{ fontSize: "11px", color: "#1E7F4F", marginTop: "4px", fontWeight: 600 }}>
                                  ✓ Completed {step.completed_date} by {step.signed_by}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h5 style={{ fontSize: "12px", color: "#7A8499", textTransform: "uppercase", marginBottom: "8px", fontWeight: 600 }}>Comments / Notes</h5>
                      <textarea 
                        value={obj.comments || ""}
                        onChange={(e) => updateObjective(catIdx, objIdx, (o) => ({...o, comments: e.target.value}))}
                        placeholder="Add progress notes or remarks for this objective..."
                        style={{ width: "100%", minHeight: "80px", padding: "10px", borderRadius: "8px", border: "1px solid #E2E8F0", fontSize: "13px", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* OVERALL SIGNATURE */}
      <div className="no-print" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "20px" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--navy)", marginBottom: "16px" }}>Digital Signatures</h3>
        <p style={{ fontSize: "12px", color: "#64748B", marginBottom: "16px" }}>By signing below, you agree to the active goals and steps outlined in this Support Plan.</p>
        
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#7A8499", marginBottom: "6px" }}>Client Signature</label>
            <input 
              type="text" 
              placeholder="Type tenant name to sign" 
              value={data.overall_client_signature || ""}
              onChange={(e) => setData({...data, overall_client_signature: e.target.value, overall_client_signature_date: new Date().toISOString().slice(0, 10)})}
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #CBD5E1", fontSize: "13px", fontFamily: "cursive" }} 
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#7A8499", marginBottom: "6px" }}>Support Worker Signature</label>
            <input 
              type="text" 
              placeholder="Type worker name to sign" 
              value={data.overall_worker_signature || ""}
              onChange={(e) => setData({...data, overall_worker_signature: e.target.value, overall_worker_signature_date: new Date().toISOString().slice(0, 10)})}
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #CBD5E1", fontSize: "13px", fontFamily: "cursive" }} 
            />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "10px" }}>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            minHeight: "48px",
            padding: "0 24px",
            borderRadius: "8px",
            border: "none",
            background: "var(--navy)",
            color: "#fff",
            fontWeight: 700,
            fontSize: "13px",
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save Support Plan"}
        </button>

        {saveMsg && (
          <span style={{ fontSize: "13px", color: saveMsg.startsWith("✓") ? "#1E7F4F" : "#E05252", fontWeight: 600 }}>
            {saveMsg}
          </span>
        )}
      </div>

    </div>
  );
}
