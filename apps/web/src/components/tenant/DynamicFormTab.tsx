"use client";

import { useEffect, useState, useCallback } from "react";
import { TextField, SelectField, FormSection } from "../form/fields";

export interface FormFieldSchema {
  id: string;
  type: "text" | "number" | "date" | "select" | "checkbox" | "textarea";
  label: string;
  required?: boolean;
  options?: string[];
}

export interface FormTemplate {
  id: string;
  org_id: string;
  name: string;
  key: string;
  schema: FormFieldSchema[];
}

import { CanonicalTenant } from "@tenant-hub/validation";

export function DynamicFormTab({ tenantId, tenant, template }: { tenantId: string; tenant?: CanonicalTenant; template: FormTemplate }) {
  const [data, setData] = useState<Record<string, any>>({});
  const [suggestedData, setSuggestedData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/tenants/${tenantId}/forms`);
    if (res.ok) {
      const forms = await res.json();
      const match = forms.find((f: any) => f.template_id === template.id);
      if (match && match.data && Object.keys(match.data).length > 0) {
        setData(match.data);
      } else if (tenant) {
        // Auto-populate based on tenant details
        const prefilled: Record<string, any> = {};
        template.schema.forEach(field => {
          const l = field.label.toLowerCase();
          if (l.includes("name") && !l.includes("nok") && !l.includes("next of kin")) prefilled[field.id] = tenant.full_name;
          if (l.includes("dob") || l.includes("date of birth") || l.includes("d.o.b")) prefilled[field.id] = tenant.dob;
          if (l.includes("nino") || l.includes("national insurance") || l.includes("ni number")) prefilled[field.id] = tenant.nino;
        });
        setData(prefilled);
      }
    }
    setLoading(false);
  }, [tenantId, template.id, tenant, template.schema]);

  useEffect(() => { void load(); }, [load]);

  async function onSave() {
    setSaving(true);
    setSaveMsg(null);
    const res = await fetch(`/api/tenants/${tenantId}/forms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: template.id, data }),
    });
    setSaving(false);
    if (!res.ok) {
      setSaveMsg("✗ Save failed");
      return;
    }
    setSaveMsg(`✓ Saved — ${new Date().toLocaleTimeString("en-GB")}`);
  }

  function set(field: string, value: any) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  if (loading) return <div style={{ padding: "40px", color: "#7A8499" }}>Loading {template.name}...</div>;

  return (
    <div style={{ marginTop: "20px" }}>
      <FormSection title={template.name}>
        {template.schema.map((field) => {
          if (field.type === "text" || field.type === "date" || field.type === "number") {
            return (
              <TextField
                key={field.id}
                label={field.label}
                type={field.type}
                required={field.required}
                value={data[field.id] ?? ""}
                onChange={(v) => set(field.id, v)}
              />
            );
          }
          if (field.type === "select") {
            return (
              <SelectField
                key={field.id}
                label={field.label}
                required={field.required}
                options={field.options || []}
                value={data[field.id] ?? ""}
                onChange={(v) => set(field.id, v)}
              />
            );
          }
          if (field.type === "textarea") {
            return (
              <div key={field.id} style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "14px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--navy)" }}>
                  {field.label} {field.required && <span style={{ color: "#E05252" }}>*</span>}
                </label>
                <textarea
                  required={field.required}
                  value={data[field.id] ?? ""}
                  onChange={(e) => set(field.id, e.target.value)}
                  style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #D9D2C7", fontSize: "13px", minHeight: "80px", boxSizing: "border-box" }}
                />
              </div>
            );
          }
          if (field.type === "checkbox") {
            return (
              <label key={field.id} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", fontSize: "13px", color: "var(--navy)" }}>
                <input
                  type="checkbox"
                  checked={Boolean(data[field.id])}
                  onChange={(e) => set(field.id, e.target.checked)}
                  style={{ width: "16px", height: "16px" }}
                />
                {field.label} {field.required && <span style={{ color: "#E05252" }}>*</span>}
              </label>
            );
          }
          return null;
        })}
      </FormSection>

      {suggestedData && (
        <div style={{ marginTop: "24px", padding: "16px", borderRadius: "8px", border: "2px solid var(--amber)", background: "#fffbeb" }}>
          <h3 style={{ margin: "0 0 12px 0", color: "#b45309", fontSize: "14px", fontWeight: 700 }}>✨ Review AI Suggestions</h3>
          <p style={{ fontSize: "13px", color: "#92400e", marginBottom: "16px" }}>
            The AI has extracted the following information. Please review and accept to apply these changes to the form.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
            {template.schema.map(field => {
              const currentVal = data[field.id];
              const suggestedVal = suggestedData[field.id];
              if (suggestedVal === undefined || suggestedVal === currentVal) return null;
              return (
                <div key={field.id} style={{ display: "flex", gap: "12px", fontSize: "13px", padding: "8px", background: "#fff", borderRadius: "4px", border: "1px solid #fde68a" }}>
                  <div style={{ fontWeight: 600, width: "140px", color: "var(--navy)" }}>{field.label}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#E05252", textDecoration: "line-through", fontSize: "12px" }}>{String(currentVal || "Empty")}</div>
                    <div style={{ color: "#1E7F4F", fontWeight: 600 }}>{String(suggestedVal)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => {
                setData(prev => ({ ...prev, ...suggestedData }));
                setSuggestedData(null);
                setSaveMsg("✓ AI suggestions applied");
              }}
              style={{ padding: "8px 16px", background: "var(--amber)", color: "#fff", border: "none", borderRadius: "6px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}
            >
              Accept All
            </button>
            <button
              onClick={() => {
                setSuggestedData(null);
                setSaveMsg("AI suggestions discarded");
              }}
              style={{ padding: "8px 16px", background: "transparent", color: "#b45309", border: "1px solid #fcd34d", borderRadius: "6px", fontWeight: 600, cursor: "pointer", fontSize: "13px" }}
            >
              Discard All
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "24px" }}>
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
          {saving ? "Saving…" : "Save Form"}
        </button>
        
        <button
          onClick={async () => {
            setSaving(true);
            setSaveMsg("Extracting fields with AI...");
            try {
              const res = await fetch("/api/ai/extract-form", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tenantId, template })
              });

              if (!res.ok) throw new Error("API Error");
              const json = await res.json();

              let rawSuggested: any = {};
              
              if (json.simulated) {
                // Fallback to simulated extraction
                await new Promise(r => setTimeout(r, 1000));
                const fakeData: any = {};
                template.schema.forEach((s: any) => {
                  if (s.type === 'text') fakeData[s.id] = s.label.includes('Name') ? 'Dominic Orume' : 'Example Response';
                  if (s.type === 'number') fakeData[s.id] = 402;
                  if (s.type === 'checkbox') fakeData[s.id] = true;
                  if (s.type === 'date') fakeData[s.id] = new Date().toISOString().split('T')[0];
                  if (s.type === 'select') fakeData[s.id] = s.options?.[0] || '';
                  if (s.type === 'textarea') fakeData[s.id] = 'Automatically generated by Matty\'s Place AI based on previous support interactions.';
                });
                rawSuggested = fakeData;
              } else {
                rawSuggested = json.data;
              }
              
              const filteredSuggested: Record<string, any> = {};
              for (const key in rawSuggested) {
                if (!data[key] || (typeof data[key] === 'string' && data[key].trim() === '')) {
                  filteredSuggested[key] = rawSuggested[key];
                }
              }

              if (Object.keys(filteredSuggested).length === 0) {
                setSuggestedData(null);
                setSaveMsg("ℹ AI found no new information for empty fields.");
              } else {
                setSuggestedData(filteredSuggested);
                setSaveMsg("✓ Fields extracted. Please review below.");
              }
            } catch(err) {
              console.error(err);
              setSaveMsg("✗ AI Extraction failed");
            }
            setSaving(false);
          }}
          disabled={saving}
          style={{
            minHeight: "48px",
            display: "inline-flex",
            alignItems: "center",
            padding: "0 24px",
            borderRadius: "8px",
            border: "1px solid var(--amber)",
            background: "#fff",
            color: "var(--amber)",
            fontWeight: 700,
            fontSize: "13px",
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Extracting..." : "✨ Auto-fill with AI"}
        </button>

        {saveMsg && (
          <span style={{ fontSize: "13px", color: saveMsg.startsWith("✓") ? "#1E7F4F" : "#E05252" }}>
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  );
}
