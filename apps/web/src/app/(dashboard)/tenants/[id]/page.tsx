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
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  TITLES,
  BENEFIT_TYPES,
  BENEFIT_FREQUENCIES,
  type CanonicalTenant,
} from "@tenant-hub/validation";
import { useTenants } from "../../../../hooks/useTenants";
import { LetterheadBlock } from "../../../../components/LetterheadBlock";
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
] as const;

function toForm(t: CanonicalTenant): FormState {
  const f: FormState = {};
  for (const k of EDITABLE_STRING_FIELDS) f[k] = (t[k] as string | undefined) ?? "";
  f["title"] = t.title ?? "";
  f["benefit_type"] = t.benefit_type ?? "";
  f["benefit_frequency"] = t.benefit_frequency ?? "";
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
      out[k] = k === "benefit_amount" ? Number(v) : v;
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
          <div 
            className="transition-transform hover:scale-105"
            style={{ 
              width: "80px", height: "80px", borderRadius: "16px", background: "var(--slate-100)", 
              display: "flex", alignItems: "center", justifyContent: "center", 
              overflow: "hidden", cursor: "pointer", border: "2px solid var(--surface)", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", flexShrink: 0
            }}
            onClick={() => {
              const fileInput = document.createElement('input');
              fileInput.type = 'file';
              fileInput.accept = 'image/*';
              fileInput.onchange = async (e: any) => {
                const file = e.target.files[0];
                if (file) {
                  alert("Image uploaded successfully! (Simulated for Sprint 3)");
                  // In a real app, you would upload to Supabase and save URL to tenant.photo_url
                }
              };
              fileInput.click();
            }}
            title="Upload Tenant Photo"
          >
            {tenant?.photo_url ? (
               <img src={tenant.photo_url} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
            className="shadow-sm cursor-pointer hover:shadow transition-shadow outline-none"
            onChange={async (e) => {
              const val = e.target.value;
              set("housing_benefit_status", val);
              await fetch(`/api/tenants/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ housing_benefit_status: val }) });
              void load();
            }}
            style={{ 
              padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--slate-200)", fontSize: "13px", fontWeight: 600,
              background: tenant?.housing_benefit_status === "active" ? "var(--emerald-50)" : tenant?.housing_benefit_status === "suspended" ? "var(--rose-50)" : "#fffbeb",
              color: tenant?.housing_benefit_status === "active" ? "var(--emerald-500)" : tenant?.housing_benefit_status === "suspended" ? "var(--rose-500)" : "#b45309"
            }}
          >
            <option value="active">🟢 HB ACTIVE (Green)</option>
            <option value="in_progress">🟠 HB IN PROGRESS (Orange)</option>
            <option value="suspended">🔴 HB SUSPENDED (Red)</option>
          </select>

          <button 
            className="transition-transform hover:-translate-y-[1px] shadow-sm"
            onClick={() => {
              if (tenant?.housing_benefit_status !== "active") {
                window.alert("❌ Cannot mark as Ready to Move-In. Housing Benefit status is not Active (Green). Please resolve the benefit issue first.");
              } else {
                window.alert("✅ Tenant marked as Ready to Move-In!");
              }
            }}
            style={{ padding: "12px", background: "var(--accent)", color: "#fff", borderRadius: "10px", border: "none", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
          >
            Mark as Ready to Move-In
          </button>
        </div>
      </div>

      {/* TABS */}
      <div className="tab-row flex flex-wrap" style={{ gap: "4px", margin: "24px 0 20px", borderBottom: "1px solid var(--slate-200)" }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="hover:bg-slate-50 transition-colors"
              style={{
                padding: "12px 16px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontFamily: "'Sora', sans-serif",
                fontSize: "14px",
                fontWeight: active ? 600 : 500,
                color: active ? "var(--accent)" : "var(--text-muted)",
                borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
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
            <SelectField label="Housing Benefit Status" value={form["housing_benefit_status"] ?? ""} onChange={(v) => set("housing_benefit_status", v)} options={["active", "in_progress", "suspended"]} required />
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
          <section id="confidentiality" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100" style={{ marginBottom: "24px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--accent)", marginBottom: "16px", borderBottom: "1px solid var(--slate-100)", paddingBottom: "12px" }}>
              6 · Confidentiality Declaration
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6, background: "var(--slate-50)", padding: "16px", borderRadius: "12px" }}>
              I authorise Ash Shahada Housing Association Ltd to hold and process my personal
              information for the purposes of providing housing and support services, and to share
              it with relevant agencies (local authority, DWP, healthcare and probation services)
              where necessary for my support and statutory obligations. Information will be held
              securely and in accordance with the Data Protection Act 2018 and UK GDPR.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
              <TextField label="Print Name" value={form["full_name"] ?? ""} onChange={() => {}} readOnly />
              <TextField label="Date Signed" type="date" value="" onChange={() => {}} />
            </div>
            <div style={{ marginTop: "16px", fontSize: "13px", color: "var(--text-main)", fontWeight: 600 }}>
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
          <div className="action-bar no-print" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <button
              onClick={onSave}
              disabled={saving}
              className="transition-transform hover:-translate-y-[1px] shadow-sm"
              style={{
                minHeight: "56px",
                padding: "0 32px",
                borderRadius: "12px",
                border: "none",
                background: "var(--accent)",
                color: "#fff",
                fontWeight: 600,
                fontSize: "15px",
                cursor: saving ? "not-allowed" : "pointer",
                fontFamily: "'Sora', sans-serif",
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              className="transition-transform hover:-translate-y-[1px] shadow-sm hover:bg-slate-50"
              onClick={() => window.print()}
              style={{
                minHeight: "56px",
                padding: "0 24px",
                borderRadius: "12px",
                border: "1px solid var(--slate-200)",
                background: "var(--surface)",
                color: "var(--text-main)",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer",
                fontFamily: "'Sora', sans-serif",
              }}
            >
              🖨️ Print Form
            </button>
            <button
              className="transition-transform hover:-translate-y-[1px] shadow-sm hover:bg-indigo-50"
              onClick={() => window.open(`/tenants/${id}/print`, '_blank')}
              style={{
                minHeight: "56px",
                padding: "0 24px",
                borderRadius: "12px",
                border: "1px solid var(--indigo-600)",
                background: "var(--surface)",
                color: "var(--indigo-600)",
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
