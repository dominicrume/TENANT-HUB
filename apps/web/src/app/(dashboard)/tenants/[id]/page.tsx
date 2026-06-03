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
  TitleSchema,
  BenefitTypeSchema,
  BenefitFrequencySchema,
  type CanonicalTenant,
} from "@tenant-hub/validation";
import { useTenants } from "../../../../hooks/useTenants";
import { LetterheadBlock } from "../../../../components/LetterheadBlock";
import { AuditStampBar } from "../../../../components/AuditStampBar";
import { FormSection, TextField, SelectField } from "../../../../components/form/fields";
import { SessionsTab } from "../../../../components/tenant/SessionsTab";
import { LedgerTab } from "../../../../components/tenant/LedgerTab";
import { ChecklistTab } from "../../../../components/tenant/ChecklistTab";

const TABS = [
  { key: "personal", label: "Personal Details" },
  { key: "sessions", label: "Sessions" },
  { key: "ledger", label: "Service Charge" },
  { key: "checklist", label: "Intake Checklist" },
] as const;

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
  const [lastHash, setLastHash] = useState<string | null>(null);

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
    // Latest audit hash for the stamp bar.
    const a = await fetch(`/api/audit-logs?tenant=${id}&limit=1`).then((r) => (r.ok ? r.json() : []));
    setLastHash(Array.isArray(a) && a[0] ? a[0].blockchain_hash : null);
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
      if (v === "") continue;
      out[k] = k === "benefit_amount" ? Number(v) : v;
    }
    return out;
  }, [form]);

  async function onSave() {
    setSaving(true);
    setSaveMsg(null);
    const res = await fetch(`/api/tenants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setSaveMsg(`✗ ${b?.error ?? "Save failed"}`);
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
    <div style={{ padding: "1.75rem", fontFamily: "'Sora', sans-serif", maxWidth: "920px" }}>
      <LetterheadBlock roomNumber={tenant?.room_number} date={tenant?.full_name} />

      {/* TABS */}
      <div style={{ display: "flex", gap: "4px", margin: "18px 0 14px", borderBottom: "1px solid #EDE8E1" }}>
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
            <SelectField label="Title" value={form["title"] ?? ""} onChange={(v) => set("title", v)} options={TitleSchema.options} required />
            <TextField label="Full Name" value={form["full_name"] ?? ""} onChange={(v) => set("full_name", v)} required />
            <TextField label="Date of Birth" type="date" value={form["dob"] ?? ""} onChange={(v) => set("dob", v)} required />
            <TextField label="National Insurance No." value={form["nino"] ?? ""} onChange={(v) => set("nino", v)} mono required />
            <TextField label="Nationality" value={form["nationality"] ?? ""} onChange={(v) => set("nationality", v)} required />
            <TextField label="Date of Entry to UK" type="date" value={form["date_entry_uk"] ?? ""} onChange={(v) => set("date_entry_uk", v)} />
          </FormSection>

          <FormSection title="2 · Accommodation">
            <TextField label="Address" value={form["address"] ?? ""} onChange={(v) => set("address", v)} required />
            <TextField label="Postcode" value={form["postcode"] ?? ""} onChange={(v) => set("postcode", v)} mono required />
            <TextField label="Room Number" value={form["room_number"] ?? ""} onChange={(v) => set("room_number", v)} placeholder="Room 1" required />
            <TextField label="Moved-in Date" type="date" value={form["moved_in"] ?? ""} onChange={(v) => set("moved_in", v)} required />
            <TextField label="Mobile" value={form["mobile"] ?? ""} onChange={(v) => set("mobile", v)} mono required />
            <TextField label="Email" type="email" value={form["email"] ?? ""} onChange={(v) => set("email", v)} />
            <TextField label="Languages" value={form["languages"] ?? ""} onChange={(v) => set("languages", v)} />
          </FormSection>

          <FormSection title="3 · Financial">
            <SelectField label="Benefit Type" value={form["benefit_type"] ?? ""} onChange={(v) => set("benefit_type", v)} options={BenefitTypeSchema.options} required />
            <SelectField label="Frequency" value={form["benefit_frequency"] ?? ""} onChange={(v) => set("benefit_frequency", v)} options={BenefitFrequencySchema.options} required />
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
          <section style={{ marginBottom: "22px" }}>
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
              enteredBy={tenant?.created_by ? "Staff" : null}
              timestamp={tenant?.updated_at ?? tenant?.created_at}
              method={tenant?.entry_method}
              hash={lastHash}
            />
          </div>

          {/* SAVE ACTION BAR */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
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
            {saveMsg && (
              <span style={{ fontSize: "13px", color: saveMsg.startsWith("✓") ? "#1E7F4F" : "#E05252" }}>
                {saveMsg}
              </span>
            )}
          </div>
        </div>
      )}

      {tab === "sessions" && <SessionsTab tenantId={id} />}
      {tab === "ledger" && <LedgerTab tenantId={id} />}
      {tab === "checklist" && <ChecklistTab tenantId={id} />}
    </div>
  );
}
