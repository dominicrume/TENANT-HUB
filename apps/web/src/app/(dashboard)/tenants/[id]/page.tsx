/**
 * Tenant detail — letterhead, tabbed record, and the Personal Details form
 * (Form 3, all fields) derived from CanonicalTenantSchema. Save goes through
 * PATCH /api/tenants/[id] → writeWithAudit (H1). The audit stamp bar shows
 * provenance and updates after each save.
 *
 * Sessions / Service Charge / Intake Checklist tabs are filled in Sprint 2.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  TITLES,
  BENEFIT_TYPES,
  BENEFIT_FREQUENCIES,
  type CanonicalTenant,
} from "@tenant-hub/validation";
import { useTenants } from "../../../../hooks/useTenants";
import { LetterheadBlock } from "../../../../components/LetterheadBlock";
import { getSupabaseBrowser } from "../../../../lib/supabase-browser";
import { AuditStampBar } from "../../../../components/AuditStampBar";
import { FormSection, TextField, SelectField } from "../../../../components/form/fields";
import { SessionsTab } from "../../../../components/tenant/SessionsTab";
import { LedgerTab } from "../../../../components/tenant/LedgerTab";
import { RelianceIntakeTab } from "../../../../components/tenant/RelianceIntakeTab";
import { SupportPlanTab } from "../../../../components/tenant/SupportPlanTab";
import { MaintenanceTab } from "../../../../components/tenant/MaintenanceTab";
import { DocumentsTab } from "../../../../components/tenant/DocumentsTab";
import { NotesTab } from "../../../../components/tenant/NotesTab";
import { DynamicFormTab, type FormTemplate } from "../../../../components/tenant/DynamicFormTab";
import { FormsPanel } from "../../../../components/layout/FormsPanel";

const CORE_TABS = [
  { key: "personal", label: "Personal Details" },
  { key: "housing-benefit", label: "Housing Benefit" },
  { key: "reliance-intake", label: "Reliance Intake" },
  { key: "support-plan", label: "Support Plan (Reliance)" },
  { key: "sessions", label: "Sessions" },
  { key: "ledger", label: "Service Charge" },
  { key: "maintenance", label: "Maintenance" },
  { key: "documents", label: "Documents" },
  { key: "notes", label: "Staff Notes" },
];

type FormState = Record<string, string>;

const EDITABLE_STRING_FIELDS = [
  "full_name", "dob", "nino", "nationality", "date_entry_uk",
  "address", "postcode", "room_number", "moved_in", "mobile", "email", "languages",
  "nok_name", "nok_relationship", "nok_phone", "nok_address",
  "doctor", "probation_officer",
  "hb_reference_number", "hb_claim_date", "hb_document_url"
] as const;

function toForm(t: CanonicalTenant): FormState {
  const f: FormState = {};
  for (const k of EDITABLE_STRING_FIELDS) f[k] = (t[k] as string | undefined) ?? "";
  f["title"] = t.title ?? "";
  f["benefit_type"] = t.benefit_type ?? "";
  f["benefit_frequency"] = t.benefit_frequency ?? "";
  f["brand"] = t.brand ?? "";
  f["benefit_amount"] = t.benefit_amount != null ? String(t.benefit_amount) : "";
  f["housing_benefit_status"] = t.housing_benefit_status ?? "in_progress";
  return f;
}

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "personal";
  const { refetch } = useTenants();

  const [tenant, setTenant] = useState<CanonicalTenant | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<Record<string, string>>({});
  const [latestAudit, setLatestAudit] = useState<{ user_name?: string; blockchain_hash?: string } | null>(null);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);

  const TABS = useMemo(() => {
    return [
      ...CORE_TABS,
      ...templates.map((t) => ({ key: t.key, label: t.name, template: t }))
    ];
  }, [templates]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tenants/${id}`);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setLoadError(b?.error ?? `${res.status} ${res.statusText}`);
      return;
    }
    const data = (await res.json()) as CanonicalTenant;
    setTenant(data);
    setForm(toForm(data));
    // Get the creation audit log to show who entered this record
    const a = await fetch(`/api/audit-logs?tenant=${id}&action=CREATE&limit=1`).then((r) => (r.ok ? r.json() : []));
    if (Array.isArray(a) && a[0]) setLatestAudit(a[0]);

    // Get the custom form templates available
    const tRes = await fetch(`/api/form-templates`);
    if (tRes.ok) setTemplates(await tRes.json());
    
    // Auto-seed reliance pack
    await fetch('/api/seed').catch(() => {});
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function setTab(key: string) {
    router.replace(`/tenants/${id}?tab=${key}`);
  }

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const patch = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(form)) {
      if (v === "") {
        // Explicitly send null so the DB clears the field
        out[k] = null;
        continue;
      }
      // Transform numerical fields and enum fields correctly
      if (k === "benefit_amount") out[k] = Number(v);
      else if (k === "brand") out[k] = v;
      else out[k] = v;
    }
    return out;
  }, [form]);

  async function onSave() {
    setSaving(true);
    setSaveMsg(null);
    setValidationIssues({});
    const res = await fetch(`/api/tenants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      if (b?.issues) {
        const issues: Record<string, string> = {};
        for (const i of b.issues) issues[i.path[0]] = i.message;
        setValidationIssues(issues);
        setSaveMsg("✗ Please fix the highlighted errors");
      } else {
        setSaveMsg(`✗ ${b?.error ?? "Save failed"}`);
      }
      return;
    }
    setSaveMsg(`✓ Saved — ${new Date().toLocaleTimeString("en-GB")}`);
    await load();
    void refetch(); // H8 — keep the list live
  }

  if (loadError) {
    return (
      <div style={{ padding: "1.75rem" }}>
        <div style={{ color: "#E05252", fontSize: "14px" }}>Error loading tenant: {loadError}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100%" }}>
      <div className="print-area" style={{ flex: 1, minWidth: 0, padding: "1.75rem", fontFamily: "'Sora', sans-serif", maxWidth: "920px" }}>
        <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", marginBottom: "16px" }}>
        <div style={{ flex: 1, display: "flex", gap: "16px", alignItems: "center" }}>
          <input 
            type="file" 
            id="profile-photo-upload"
            style={{ display: 'none' }} 
            accept="image/*"
            onChange={async (e: any) => {
              const file = e.target.files[0];
              if (file) {
                const supabase = getSupabaseBrowser();
                const ext = file.name.split('.').pop();
                const fileName = `tenant-${id}-${Date.now()}.${ext}`;
                
                const { data, error } = await supabase.storage
                  .from("maintenance-photos")
                  .upload(fileName, file);
                  
                if (error) {
                  alert("Failed to upload image: " + error.message);
                  return;
                }
                
                if (data) {
                  const publicUrl = supabase.storage.from("maintenance-photos").getPublicUrl(data.path).data.publicUrl;
                  setTenant(prev => prev ? { ...prev, photo_url: publicUrl } : null);
                  await fetch(`/api/tenants/${id}`, { 
                    method: "PATCH", 
                    headers: { "Content-Type": "application/json" }, 
                    body: JSON.stringify({ photo_url: publicUrl }) 
                  });
                }
              }
              e.target.value = '';
            }}
          />
          <div 
            style={{ 
              width: "72px", height: "72px", borderRadius: "50%", background: "#E2E8F0", 
              display: "flex", alignItems: "center", justifyContent: "center", 
              overflow: "hidden", cursor: "pointer", border: "2px solid #fff", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", flexShrink: 0,
              position: "relative"
            }}
            onClick={() => document.getElementById('profile-photo-upload')?.click()}
            title="Upload Tenant Photo"
          >
            {tenant?.photo_url ? (
               <Image src={tenant.photo_url} alt="Profile" fill sizes="72px" style={{ objectFit: "cover" }} />
            ) : (
               <span style={{ fontSize: "24px" }}>📷</span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <LetterheadBlock roomNumber={tenant?.room_number} date={tenant?.full_name} />
          </div>
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "220px" }}>
          <select 
            value={tenant?.housing_benefit_status || "in_progress"} 
            onChange={async (e) => {
              const val = e.target.value as "active" | "in_progress" | "suspended";
              set("housing_benefit_status", val);
              // Optimistic UI update
              if (tenant) {
                setTenant({ ...tenant, housing_benefit_status: val });
              }
              // Silently patch in the background without awaiting load()
              fetch(`/api/tenants/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ housing_benefit_status: val }) });
            }}
            style={{ 
              padding: "10px", borderRadius: "8px", border: "1px solid #EDE8E1", fontSize: "12px", fontWeight: 700,
              background: tenant?.housing_benefit_status === "active" ? "#f0fdf4" : tenant?.housing_benefit_status === "suspended" ? "#fef2f2" : "#fffbeb",
              color: tenant?.housing_benefit_status === "active" ? "#166534" : tenant?.housing_benefit_status === "suspended" ? "#991b1b" : "#b45309"
            }}
          >
            <option value="active">🟢 HB ACTIVE (Green)</option>
            <option value="in_progress">🟠 HB IN PROGRESS (Orange)</option>
            <option value="suspended">🔴 HB SUSPENDED (Red)</option>
          </select>

          <button 
            onClick={() => {
              if (tenant?.housing_benefit_status !== "active") {
                window.alert("❌ Cannot mark as Ready to Move-In. Housing Benefit status is not Active (Green). Please resolve the benefit issue first.");
              } else {
                window.alert("✅ Tenant marked as Ready to Move-In!");
              }
            }}
            style={{ padding: "10px", background: "var(--navy)", color: "#fff", borderRadius: "8px", border: "none", fontWeight: 600, fontSize: "12px", cursor: "pointer" }}
          >
            Mark as Ready to Move-In
          </button>
          <button 
            onClick={async () => {
              if (window.confirm(tenant?.is_archived ? "Unarchive this tenant?" : "Archive this tenant? They will be marked as Gray.")) {
                await fetch(`/api/tenants/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_archived: !tenant?.is_archived }) });
                void load();
              }
            }}
            style={{ padding: "10px", background: tenant?.is_archived ? "#e5e7eb" : "#f3f4f6", color: "#374151", borderRadius: "8px", border: "1px solid #d1d5db", fontWeight: 600, fontSize: "12px", cursor: "pointer" }}
          >
            {tenant?.is_archived ? "Unarchive Tenant" : "Archive Tenant (Gray)"}
          </button>
        </div>
      </div>

      {/* TABS */}
      <div className="tab-row" style={{ display: "flex", flexWrap: "wrap", gap: "4px", margin: "18px 0 14px", borderBottom: "1px solid #EDE8E1" }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "9px 14px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontFamily: "'Sora', sans-serif",
                fontSize: "13px",
                fontWeight: active ? 700 : 500,
                color: active ? "var(--navy)" : "#7A8499",
                borderBottom: active ? "2px solid var(--amber)" : "2px solid transparent",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "personal" && (
        <div>
          <FormSection title="1 · Personal Information">
            <SelectField label="Title" value={form["title"] ?? ""} onChange={(v) => set("title", v)} options={TITLES as unknown as string[]} required />
            {validationIssues["title"] && <div style={{color:"#E05252", fontSize:"12px"}}>{validationIssues["title"]}</div>}
            
            <TextField label="Full Name" value={form["full_name"] ?? ""} onChange={(v) => set("full_name", v)} required />
            {validationIssues["full_name"] && <div style={{color:"#E05252", fontSize:"12px"}}>{validationIssues["full_name"]}</div>}
            
            <TextField label="Date of Birth" type="date" value={form["dob"] ?? ""} onChange={(v) => set("dob", v)} required />
            {validationIssues["dob"] && <div style={{color:"#E05252", fontSize:"12px"}}>{validationIssues["dob"]}</div>}
            
            <TextField label="National Insurance No." value={form["nino"] ?? ""} onChange={(v) => set("nino", v)} mono required />
            {validationIssues["nino"] && <div style={{color:"#E05252", fontSize:"12px"}}>{validationIssues["nino"]}</div>}
            
            <TextField label="Nationality" value={form["nationality"] ?? ""} onChange={(v) => set("nationality", v)} required />
            {validationIssues["nationality"] && <div style={{color:"#E05252", fontSize:"12px"}}>{validationIssues["nationality"]}</div>}
            
            <TextField label="Date of Entry to UK" type="date" value={form["date_entry_uk"] ?? ""} onChange={(v) => set("date_entry_uk", v)} />
            {validationIssues["date_entry_uk"] && <div style={{color:"#E05252", fontSize:"12px"}}>{validationIssues["date_entry_uk"]}</div>}
          </FormSection>

          <FormSection title="2 · Accommodation">
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--navy)", marginBottom: "4px" }}>
                HMO Assignment (Brand) <span style={{ color: "#E05252" }}>*</span>
              </span>
              <select 
                value={form["brand"] ?? ""} 
                onChange={(e) => set("brand", e.target.value)} 
                required
                style={{ width: "100%", minHeight: "44px", padding: "9px 11px", borderRadius: "8px", border: "1px solid #EDE8E1", fontFamily: "'Sora', sans-serif", fontSize: "14px", background: "#fff", boxSizing: "border-box" }}
              >
                <option value="mattys_place">Matty&apos;s Place</option>
                <option value="reliance">Reliance Housing</option>
              </select>
            </label>
            {validationIssues["brand"] && <div style={{color:"#E05252", fontSize:"12px"}}>{validationIssues["brand"]}</div>}
            
            <TextField label="Address" value={form["address"] ?? ""} onChange={(v) => set("address", v)} required />
            {validationIssues["address"] && <div style={{color:"#E05252", fontSize:"12px"}}>{validationIssues["address"]}</div>}
            
            <TextField label="Postcode" value={form["postcode"] ?? ""} onChange={(v) => set("postcode", v)} mono required />
            {validationIssues["postcode"] && <div style={{color:"#E05252", fontSize:"12px"}}>{validationIssues["postcode"]}</div>}
            
            <TextField label="Room Number" value={form["room_number"] ?? ""} onChange={(v) => set("room_number", v)} placeholder="Room 1" required />
            {validationIssues["room_number"] && <div style={{color:"#E05252", fontSize:"12px"}}>{validationIssues["room_number"]}</div>}
            
            <TextField label="Moved-in Date" type="date" value={form["moved_in"] ?? ""} onChange={(v) => set("moved_in", v)} required />
            {validationIssues["moved_in"] && <div style={{color:"#E05252", fontSize:"12px"}}>{validationIssues["moved_in"]}</div>}
            
            <TextField label="Mobile" value={form["mobile"] ?? ""} onChange={(v) => set("mobile", v)} mono required />
            {validationIssues["mobile"] && <div style={{color:"#E05252", fontSize:"12px"}}>{validationIssues["mobile"]}</div>}
            
            <TextField label="Email" type="email" value={form["email"] ?? ""} onChange={(v) => set("email", v)} />
            {validationIssues["email"] && <div style={{color:"#E05252", fontSize:"12px"}}>{validationIssues["email"]}</div>}
            
            <TextField label="Languages" value={form["languages"] ?? ""} onChange={(v) => set("languages", v)} />
            {validationIssues["languages"] && <div style={{color:"#E05252", fontSize:"12px"}}>{validationIssues["languages"]}</div>}
          </FormSection>

          <FormSection title="3 · Financial">
            <SelectField label="Benefit Type" value={form["benefit_type"] ?? ""} onChange={(v) => set("benefit_type", v)} options={BENEFIT_TYPES as unknown as string[]} required />
            <SelectField label="Frequency" value={form["benefit_frequency"] ?? ""} onChange={(v) => set("benefit_frequency", v)} options={BENEFIT_FREQUENCIES as unknown as string[]} required />
            <TextField label="Amount (£)" type="number" value={form["benefit_amount"] ?? ""} onChange={(v) => set("benefit_amount", v)} mono required />
          </FormSection>

          <FormSection title="4 · Next of Kin">
            <TextField label="Name" value={form["nok_name"] ?? ""} onChange={(v) => set("nok_name", v)} required />
            <TextField label="Relationship" value={form["nok_relationship"] ?? ""} onChange={(v) => set("nok_relationship", v)} required />
            <TextField label="Phone" value={form["nok_phone"] ?? ""} onChange={(v) => set("nok_phone", v)} mono required />
            <TextField label="Address" value={form["nok_address"] ?? ""} onChange={(v) => set("nok_address", v)} />
          </FormSection>

          <FormSection title="5 · Professional Contacts">
            <TextField label="Doctor / GP" value={form["doctor"] ?? ""} onChange={(v) => set("doctor", v)} />
            <TextField label="Probation Officer" value={form["probation_officer"] ?? ""} onChange={(v) => set("probation_officer", v)} />
          </FormSection>

          {/* 6 · Confidentiality Declaration (static authorisation text) */}
          <section id="confidentiality" style={{ marginBottom: "22px" }}>
            <h3 style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--amber)", marginBottom: "10px", borderBottom: "1px solid #EDE8E1", paddingBottom: "5px" }}>
              6 · Confidentiality Declaration
            </h3>
            <p style={{ fontSize: "12px", color: "#445", lineHeight: 1.6, background: "#F8F4EF", padding: "12px", borderRadius: "8px" }}>
              I authorise Ash Shahada Housing Association Ltd to hold and process my personal
              information for the purposes of providing housing and support services, and to share
              it with relevant agencies (local authority, DWP, healthcare and probation services)
              where necessary for my support and statutory obligations. Information will be held
              securely and in accordance with the Data Protection Act 2018 and UK GDPR.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px" }}>
              <TextField label="Print Name" value={form["full_name"] ?? ""} onChange={() => {}} readOnly />
              <TextField label="Date Signed" type="date" value="" onChange={() => {}} />
            </div>
            <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--navy)", fontWeight: 600 }}>
              On behalf of Ash Shahada Housing Association Ltd — AHSAN REHMAN
            </div>
          </section>

          <div style={{ marginBottom: "14px" }}>
            <AuditStampBar
              enteredBy={latestAudit?.user_name ?? "Staff"}
              timestamp={tenant?.updated_at ?? tenant?.created_at}
              method={tenant?.entry_method}
              hash={latestAudit?.blockchain_hash}
            />
          </div>

          {/* SAVE ACTION BAR */}
          <div className="action-bar no-print" style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <button
              onClick={onSave}
              disabled={saving}
              style={{
                minHeight: "56px",
                padding: "0 26px",
                borderRadius: "8px",
                border: "none",
                background: "var(--navy)",
                color: "#fff",
                fontWeight: 700,
                fontSize: "14px",
                cursor: saving ? "not-allowed" : "pointer",
                fontFamily: "'Sora', sans-serif",
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              onClick={() => window.print()}
              style={{
                minHeight: "56px",
                padding: "0 26px",
                borderRadius: "8px",
                border: "1px solid #38bdf8",
                background: "#f0f9ff",
                color: "#0ea5e9",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer",
                fontFamily: "'Sora', sans-serif",
              }}
            >
              🖨️ Print Form
            </button>
            <button
              onClick={() => window.open(`/tenants/${id}/print`, '_blank')}
              style={{
                minHeight: "56px",
                padding: "0 26px",
                borderRadius: "8px",
                border: "1px solid #1E7F4F",
                background: "#f0fdf4",
                color: "#1E7F4F",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer",
                fontFamily: "'Sora', sans-serif",
              }}
            >
              📑 Print Full Dossier
            </button>
            {saveMsg && (
              <span style={{ fontSize: "13px", color: saveMsg.startsWith("✓") ? "#1E7F4F" : "#E05252" }}>
                {saveMsg}
              </span>
            )}
          </div>
        </div>
      )}

      {tab === "housing-benefit" && (
        <div>
          {form["hb_claim_date"] && new Date(form["hb_claim_date"]) < new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) && form["housing_benefit_status"] === "in_progress" && (
            <div style={{ background: "#fffbeb", border: "1px solid #f59e0b", color: "#b45309", padding: "12px", borderRadius: "8px", marginBottom: "16px", fontWeight: 600 }}>
              ⚠️ Claim pending for &gt; 14 days. Please follow up!
            </div>
          )}
          <FormSection title="Housing Benefit Claim Information">
            <TextField label="HB Reference Number" value={form["hb_reference_number"] ?? ""} onChange={(v) => set("hb_reference_number", v)} />
            <TextField label="Claim Date" type="date" value={form["hb_claim_date"] ?? ""} onChange={(v) => set("hb_claim_date", v)} />
            <SelectField label="Status" value={form["housing_benefit_status"] ?? "in_progress"} onChange={(v) => set("housing_benefit_status", v)} options={["active", "in_progress", "suspended"]} />
            <div style={{ marginTop: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "#7A8499", marginBottom: "6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Upload Evidence Document</label>
              <input type="file" accept="application/pdf,image/*" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const supabase = getSupabaseBrowser();
                  const ext = file.name.split('.').pop();
                  const fileName = `hb-${id}-${Date.now()}.${ext}`;
                  
                  const { data, error } = await supabase.storage
                    .from("tenant-documents")
                    .upload(fileName, file);
                    
                  if (error) {
                    alert("Failed to upload document: " + error.message);
                    return;
                  }
                  
                  if (data) {
                    const publicUrl = supabase.storage.from("tenant-documents").getPublicUrl(data.path).data.publicUrl;
                    set("hb_document_url", publicUrl);
                    
                    // Also save it to the tenant's document vault!
                    await fetch("/api/documents", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        tenant_id: id,
                        name: "Housing Benefit Evidence: " + file.name,
                        file_url: data.path
                      })
                    });
                    
                    alert("Document uploaded safely to the vault!");
                  }
                }
              }} style={{ display: "block", marginBottom: "8px", padding: "8px", border: "1px solid #d1d5db", borderRadius: "6px", width: "100%", background: "#f9fafb", cursor: "pointer" }} />
              {form["hb_document_url"] && (
                <div style={{ marginTop: "8px", padding: "12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "20px" }}>✅</span>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: "13px", color: "#166534", fontWeight: 600 }}>Document Safely Uploaded</span>
                    <a href={form["hb_document_url"]} target="_blank" rel="noreferrer" style={{ fontSize: "12px", color: "var(--navy)", textDecoration: "underline" }}>
                      View Evidence Document
                    </a>
                  </div>
                </div>
              )}
            </div>
          </FormSection>
          <div className="action-bar no-print" style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "24px" }}>
            <button
              onClick={onSave}
              disabled={saving}
              style={{
                minHeight: "56px",
                padding: "0 26px",
                borderRadius: "8px",
                border: "none",
                background: "var(--navy)",
                color: "#fff",
                fontWeight: 700,
                fontSize: "14px",
                cursor: saving ? "not-allowed" : "pointer",
                fontFamily: "'Sora', sans-serif",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
            {saveMsg && (
              <span style={{ fontSize: "13px", color: saveMsg.startsWith("✓") ? "#1E7F4F" : "#E05252" }}>
                {saveMsg}
              </span>
            )}
          </div>
        </div>
      )}

      {tab === "support-plan" && <SupportPlanTab tenantId={id} tenant={tenant!} />}
      {tab === "reliance-intake" && <RelianceIntakeTab tenantId={id} tenant={tenant!} />}
      {tab === "sessions" && <SessionsTab tenantId={id} />}
      {tab === "ledger" && <LedgerTab tenantId={id} />}
      {tab === "maintenance" && <MaintenanceTab tenantId={id} roomNumber={tenant?.room_number} />}
      {tab === "documents" && <DocumentsTab tenantId={id} />}
      {tab === "notes" && <NotesTab tenantId={id} />}
      {TABS.find(t => t.key === tab && 'template' in t) && (
        <DynamicFormTab tenantId={id} tenant={tenant!} template={(TABS.find(t => t.key === tab) as any).template} />
      )}
      </div>

      {tenant && <FormsPanel tenant={tenant} />}
    </div>
  );
}
