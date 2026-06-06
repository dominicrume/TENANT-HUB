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

export function DynamicFormTab({ tenantId, template }: { tenantId: string; template: FormTemplate }) {
  const [data, setData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/tenants/${tenantId}/forms`);
    if (res.ok) {
      const forms = await res.json();
      const match = forms.find((f: any) => f.template_id === template.id);
      if (match && match.data) {
        setData(match.data);
      }
    }
    setLoading(false);
  }, [tenantId, template.id]);

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
        {saveMsg && (
          <span style={{ fontSize: "13px", color: saveMsg.startsWith("✓") ? "#1E7F4F" : "#E05252" }}>
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  );
}
