"use client";

import { useEffect, useState, useCallback } from "react";
import { type FormTemplate, type FormFieldSchema } from "../../../../components/tenant/DynamicFormTab";
import { TextField, SelectField, FormSection } from "../../../../components/form/fields";

export default function FormBuilderPage() {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [selected, setSelected] = useState<FormTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/form-templates");
    if (res.ok) {
      const data = await res.json();
      setTemplates(data);
      if (data.length > 0 && !selected) setSelected(data[0]);
    }
    setLoading(false);
  }, [selected]);

  useEffect(() => { void load(); }, [load]);

  async function onSave() {
    if (!selected) return;
    setSaving(true);
    const res = await fetch("/api/form-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: selected.name,
        key: selected.key,
        schema: selected.schema
      })
    });
    setSaving(false);
    if (res.ok) alert("Template saved successfully.");
    else alert("Failed to save template.");
  }

  function addField() {
    if (!selected) return;
    const newField: FormFieldSchema = {
      id: `field_${Date.now()}`,
      type: "text",
      label: "New Field",
      required: false,
    };
    setSelected({ ...selected, schema: [...selected.schema, newField] });
  }

  function updateField(idx: number, updates: Partial<FormFieldSchema>) {
    if (!selected) return;
    const newSchema = [...selected.schema];
    newSchema[idx] = { ...newSchema[idx], ...updates } as FormFieldSchema;
    setSelected({ ...selected, schema: newSchema });
  }

  function removeField(idx: number) {
    if (!selected) return;
    const newSchema = [...selected.schema];
    newSchema.splice(idx, 1);
    setSelected({ ...selected, schema: newSchema });
  }

  if (loading) return <div style={{ padding: "40px" }}>Loading Form Builder...</div>;

  return (
    <div style={{ padding: "40px", maxWidth: "900px", margin: "0 auto", fontFamily: "'Sora', sans-serif" }}>
      <h1 style={{ fontSize: "24px", color: "var(--navy)", marginBottom: "20px" }}>Form Builder</h1>
      <p style={{ color: "#7A8499", marginBottom: "30px", fontSize: "14px" }}>
        Design custom data collection forms for your tenants. These forms will appear as tabs on the Tenant Profile.
      </p>

      <div style={{ display: "flex", gap: "20px" }}>
        {/* Sidebar Templates List */}
        <div style={{ width: "250px", borderRight: "1px solid #EDE8E1", paddingRight: "20px" }}>
          <h3 style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--amber)", marginBottom: "12px" }}>Your Forms</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                style={{
                  textAlign: "left",
                  padding: "10px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  background: selected?.id === t.id ? "rgba(76,124,232,0.1)" : "transparent",
                  color: selected?.id === t.id ? "#4C7CE8" : "var(--navy)",
                  fontWeight: selected?.id === t.id ? 700 : 500,
                  fontSize: "13px"
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        {selected && (
          <div style={{ flex: 1 }}>
            <div style={{ background: "#F8F4EF", padding: "20px", borderRadius: "12px", marginBottom: "20px" }}>
              <TextField label="Form Name" value={selected.name} onChange={v => setSelected({...selected, name: v})} required />
              <TextField label="System Key (no spaces)" value={selected.key} onChange={v => setSelected({...selected, key: v})} mono required />
            </div>

            <h3 style={{ fontSize: "16px", color: "var(--navy)", marginBottom: "16px" }}>Fields</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "20px" }}>
              {selected.schema.map((field, idx) => (
                <div key={idx} style={{ padding: "16px", border: "1px solid #EDE8E1", borderRadius: "12px", position: "relative" }}>
                  <button
                    onClick={() => removeField(idx)}
                    style={{ position: "absolute", top: "12px", right: "12px", background: "none", border: "none", color: "#E05252", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}
                  >
                    Remove
                  </button>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", color: "#7A8499", marginBottom: "4px" }}>Field Label</label>
                      <input 
                        type="text" 
                        value={field.label} 
                        onChange={e => updateField(idx, { label: e.target.value })} 
                        style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #D9D2C7" }} 
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", color: "#7A8499", marginBottom: "4px" }}>Field ID (System)</label>
                      <input 
                        type="text" 
                        value={field.id} 
                        onChange={e => updateField(idx, { id: e.target.value })} 
                        style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #D9D2C7", fontFamily: "monospace" }} 
                      />
                    </div>
                  </div>
                  
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", alignItems: "center" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", color: "#7A8499", marginBottom: "4px" }}>Type</label>
                      <select 
                        value={field.type} 
                        onChange={e => updateField(idx, { type: e.target.value as any })}
                        style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #D9D2C7" }}
                      >
                        <option value="text">Short Text</option>
                        <option value="textarea">Long Text</option>
                        <option value="number">Number</option>
                        <option value="date">Date</option>
                        <option value="checkbox">Checkbox</option>
                        <option value="select">Dropdown (Select)</option>
                      </select>
                    </div>
                    <div style={{ paddingTop: "18px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--navy)" }}>
                        <input 
                          type="checkbox" 
                          checked={field.required} 
                          onChange={e => updateField(idx, { required: e.target.checked })} 
                        />
                        Required Field
                      </label>
                    </div>
                  </div>

                  {field.type === "select" && (
                    <div style={{ marginTop: "12px" }}>
                      <label style={{ display: "block", fontSize: "12px", color: "#7A8499", marginBottom: "4px" }}>Dropdown Options (comma separated)</label>
                      <input 
                        type="text" 
                        value={(field.options || []).join(", ")} 
                        onChange={e => updateField(idx, { options: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                        style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #D9D2C7" }} 
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button onClick={addField} style={{ padding: "10px 20px", borderRadius: "8px", border: "1px dashed var(--navy)", background: "transparent", color: "var(--navy)", fontWeight: 600, cursor: "pointer", marginBottom: "30px", width: "100%" }}>
              + Add Field
            </button>

            <div style={{ borderTop: "1px solid #EDE8E1", paddingTop: "20px", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={onSave} disabled={saving} style={{ padding: "12px 24px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
                {saving ? "Saving..." : "Save Template"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
