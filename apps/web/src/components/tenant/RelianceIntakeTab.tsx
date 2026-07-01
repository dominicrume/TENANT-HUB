"use client";

import { useEffect, useState, useCallback } from "react";
import { CanonicalTenant, ReliancePack } from "@tenant-hub/validation";
import { DigitalSignaturePad } from "../form/DigitalSignaturePad";

// The tabs inside the Reliance Intake wizard
type Step = "dashboard" | "referral" | "missing-person" | "consents";

export function RelianceIntakeTab({ tenantId, tenant }: { tenantId: string; tenant?: CanonicalTenant }) {
  const [data, setData] = useState<ReliancePack | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("dashboard");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/tenants/${tenantId}/forms`);
    if (res.ok) {
      const forms = await res.json();
      const match = forms.find((f: any) => f.template_id === "reliance-intake-pack");
      
      if (match && match.data && Object.keys(match.data).length > 0) {
        setData(match.data as ReliancePack);
      } else if (tenant) {
        // First time loading - Auto Populate from Core Tenant!
        const initialPack: ReliancePack = {
          tracker: {},
          referral: {
            date_of_assessment: new Date().toISOString().slice(0, 10),
            title: tenant.title,
            first_name: tenant.full_name?.split(" ")[0],
            surname: tenant.full_name?.split(" ").slice(1).join(" "),
            dob: tenant.dob,
            nino: tenant.nino,
            mobile_no: tenant.mobile,
            home_no: tenant.mobile, // Fallback
            previous_address: tenant.address,
            postcode: tenant.postcode,
            registered_gp: tenant.doctor || "",
            support_needs: [],
            communication_needs: [],
            criteria_met: false,
            placement_awarded: false,
            uses_drugs: false,
            uses_alcohol: false,
            alcohol_issue: false
          },
          missing_person: {
            full_name: tenant.full_name,
            dob: tenant.dob,
            nino: tenant.nino,
            mobile_number: tenant.mobile,
            address: tenant.address,
            next_of_kin_name: tenant.nok_name,
            next_of_kin_contact: tenant.nok_phone,
            next_of_kin_relationship: tenant.nok_relationship,
            next_of_kin_address: tenant.nok_address,
          },
          consents: {}
        };
        setData(initialPack);
      }
    }
    setLoading(false);
  }, [tenantId, tenant]);

  useEffect(() => { void load(); }, [load]);

  async function onSave() {
    if (!data) return;
    setSaving(true);
    setSaveMsg(null);
    
    // Validate required fields (Simplified check)
    const missing = [];
    if (!data.consents?.bcc_housing_benefit_consent_signed_by) missing.push("BCC Housing Benefit Consent");
    if (!data.consents?.service_charge_agreement_signed_by) missing.push("Service Charge Agreement");
    if (!data.missing_person?.next_of_kin_name) missing.push("Next of Kin Name");
    
    if (missing.length > 0) {
      window.alert(`Validation Error: Missing required sections:\n- ${missing.join("\n- ")}`);
      setSaving(false);
      return;
    }
    
    // Save to Forms DB
    const res = await fetch(`/api/tenants/${tenantId}/forms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: "reliance-intake-pack", data }),
    });
    
    // If Housing Benefit Consent or HB Ref is updated, sync back to core Tenant to protect revenue
    await fetch(`/api/tenants/${tenantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Mark as 'active' (Green) if they signed consent and have a reference.
        // Mark as 'suspended' (Red/At Risk) if they are missing critical revenue documents.
        housing_benefit_status: (data.consents.bcc_housing_benefit_consent_signed_by && data.tracker.housing_benefit_reference) ? "active" : "suspended"
      })
    });

    setSaving(false);
    if (!res.ok) {
      setSaveMsg("✗ Save failed");
      return;
    }
    setSaveMsg(`✓ Saved — ${new Date().toLocaleTimeString("en-GB")}`);
  }

  function handlePrint() {
    // Basic validation before printing
    if (!data?.consents?.bcc_housing_benefit_consent_signed_by || !data?.consents?.service_charge_agreement_signed_by) {
      const ok = window.confirm("Warning: Some critical consents are missing signatures. Are you sure you want to print an incomplete pack?");
      if (!ok) return;
    }
    window.open(`/print/${tenantId}`, "_blank");
  }

  if (loading || !data) return <div style={{ padding: "40px", color: "#7A8499" }}>Loading Reliance Pack...</div>;

  const handleTrackerChange = (key: keyof ReliancePack["tracker"], value: string) => {
    setData({ ...data, tracker: { ...data.tracker, [key]: value } });
  };
  const handleRefChange = (key: keyof ReliancePack["referral"], value: any) => {
    setData({ ...data, referral: { ...data.referral, [key]: value } });
  };
  const handleMissingChange = (key: keyof ReliancePack["missing_person"], value: string) => {
    setData({ ...data, missing_person: { ...data.missing_person, [key]: value } });
  };
  const handleConsentChange = (key: keyof ReliancePack["consents"], value: string) => {
    setData({ ...data, consents: { ...data.consents, [key]: value } });
  };

  async function notifyNextOfKin() {
    if (!data?.missing_person.next_of_kin_contact) {
      window.alert("Please provide a contact number first.");
      return;
    }
    const res = await fetch("/api/communications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        channel: "sms",
        message_type: "notification",
        to_phone: data.missing_person.next_of_kin_contact,
        content: `Hello, you have been listed as the Next of Kin / Emergency Contact for ${data.missing_person.full_name || tenant?.full_name} at Reliance Social Housing. You will be contacted in the event of an emergency or if they are reported missing. Reply STOP to opt out.`
      })
    });
    if (res.ok) {
      window.alert("SMS Notification dispatched successfully.");
    } else {
      window.alert("Failed to send SMS.");
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "24px" }}>
      
      {/* Wizard Header */}
      <div style={{ display: "flex", gap: "12px", borderBottom: "2px solid #EDE8E1", paddingBottom: "12px" }}>
        {[
          { id: "dashboard", label: "Pack Tracker" },
          { id: "referral", label: "Initial Assessment" },
          { id: "missing-person", label: "Missing Person" },
          { id: "consents", label: "Consents & Policies" }
        ].map(s => (
          <button
            key={s.id}
            onClick={() => setStep(s.id as Step)}
            style={{
              padding: "8px 16px",
              borderRadius: "20px",
              border: "none",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
              background: step === s.id ? "var(--navy)" : "#F8FAFC",
              color: step === s.id ? "#fff" : "#64748B",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* STEP 1: DASHBOARD TRACKER */}
      {step === "dashboard" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          
          <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: "12px", padding: "20px" }}>
             <h3 style={{ margin: "0 0 12px 0", color: "#991B1B", fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
               <span>⚠️</span> Revenue Protection (Housing Benefit)
             </h3>
             <p style={{ fontSize: "13px", color: "#7F1D1D", marginBottom: "16px" }}>The Housing Benefit Claim and BCC Consent must be completed immediately upon arrival to secure revenue for the business.</p>
             
             <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
               <div>
                 <label style={{ display: "block", fontSize: "12px", color: "#991B1B", fontWeight: 600, marginBottom: "6px" }}>BCC Consent Signed?</label>
                 <div style={{ padding: "10px", background: "#fff", borderRadius: "8px", border: "1px solid #FCA5A5", fontSize: "13px", color: data.consents.bcc_housing_benefit_consent_signed_by ? "#15803D" : "#DC2626", fontWeight: 700 }}>
                   {data.consents.bcc_housing_benefit_consent_signed_by ? `✓ Yes, by ${data.consents.bcc_housing_benefit_consent_signed_by}` : "✗ MISSING"}
                 </div>
               </div>
               <div>
                 <label style={{ display: "block", fontSize: "12px", color: "#991B1B", fontWeight: 600, marginBottom: "6px" }}>HB Claim Reference Number</label>
                 <input 
                   type="text" 
                   placeholder="Enter HB Ref (e.g. HB123456)" 
                   value={data.tracker.housing_benefit_reference || ""}
                   onChange={(e) => handleTrackerChange("housing_benefit_reference", e.target.value)}
                   style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #FCA5A5", fontSize: "13px", fontWeight: 700 }}
                 />
               </div>
             </div>
          </div>

          <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "20px" }}>
            <h3 style={{ margin: "0 0 16px 0", color: "var(--navy)", fontSize: "15px" }}>Intake Checklist</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                { key: "housing_benefit_claim_date", label: "Housing Benefit Claim" },
                { key: "personal_details_date", label: "Personal Details" },
                { key: "missing_person_date", label: "Missing Person Form" },
                { key: "initial_assessment_date", label: "Initial Assessment" },
                { key: "service_charge_date", label: "Service Charge Agreement" },
                { key: "confidentiality_date", label: "Confidentiality Form" },
                { key: "risk_support_plan_date", label: "Risk Assessment / Support Plan" }
              ].map(item => {
                const isChecked = !!data.tracker[item.key as keyof ReliancePack["tracker"]];
                return (
                  <div key={item.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px", background: "#fff", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <input 
                        type="checkbox" 
                        checked={isChecked}
                        onChange={(e) => handleTrackerChange(item.key as keyof ReliancePack["tracker"], e.target.checked ? today : "")}
                        style={{ width: "18px", height: "18px", cursor: "pointer" }}
                      />
                      <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--navy)", textDecoration: isChecked ? "line-through" : "none" }}>{item.label}</span>
                    </div>
                    {isChecked && <span style={{ fontSize: "12px", color: "#1E7F4F", fontWeight: 600 }}>Completed {data.tracker[item.key as keyof ReliancePack["tracker"]]}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: REFERRAL / INITIAL ASSESSMENT */}
      {step === "referral" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ background: "#F8F4EF", padding: "20px", borderRadius: "12px", border: "1px solid #EDE8E1" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "15px", color: "var(--navy)" }}>Personal Details (Auto-Populated)</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <TextInput label="First Name" value={data.referral.first_name} onChange={(v: string) => handleRefChange("first_name", v)} />
              <TextInput label="Surname" value={data.referral.surname} onChange={(v: string) => handleRefChange("surname", v)} />
              <TextInput label="NINO" value={data.referral.nino} onChange={(v: string) => handleRefChange("nino", v)} />
              <TextInput label="Date of Birth" type="date" value={data.referral.dob} onChange={(v: string) => handleRefChange("dob", v)} />
              <TextInput label="Mobile" value={data.referral.mobile_no} onChange={(v: string) => handleRefChange("mobile_no", v)} />
            </div>
          </div>

          <div style={{ background: "#fff", padding: "20px", borderRadius: "12px", border: "1px solid #EDE8E1" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "15px", color: "var(--navy)" }}>Physical & Mental Health</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <TextInput label="Registered GP" value={data.referral.registered_gp} onChange={(v: string) => handleRefChange("registered_gp", v)} />
              <TextInput label="Physical Health Conditions" value={data.referral.physical_health} onChange={(v: string) => handleRefChange("physical_health", v)} />
              <TextInput label="Mental Health Conditions" value={data.referral.mental_health} onChange={(v: string) => handleRefChange("mental_health", v)} />
              <TextInput label="Prescribed Medication" value={data.referral.medication} onChange={(v: string) => handleRefChange("medication", v)} />
              
              <div style={{ marginTop: "10px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--navy)", marginBottom: "8px" }}>Substance Use</label>
                <div style={{ display: "flex", gap: "20px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                    <input type="checkbox" checked={data.referral.uses_drugs} onChange={(e) => handleRefChange("uses_drugs", e.target.checked)} />
                    Uses Drugs
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                    <input type="checkbox" checked={data.referral.uses_alcohol} onChange={(e) => handleRefChange("uses_alcohol", e.target.checked)} />
                    Uses Alcohol
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: MISSING PERSON */}
      {step === "missing-person" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
           <div style={{ background: "#fff", padding: "20px", borderRadius: "12px", border: "1px solid #EDE8E1" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "15px", color: "var(--navy)" }}>Physical Description</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <TextInput label="Height" value={data.missing_person.height} onChange={(v: string) => handleMissingChange("height", v)} />
              <TextInput label="Build" value={data.missing_person.build} onChange={(v: string) => handleMissingChange("build", v)} />
              <TextInput label="Hair Color" value={data.missing_person.hair_color} onChange={(v: string) => handleMissingChange("hair_color", v)} />
              <TextInput label="Eye Color" value={data.missing_person.eye_color} onChange={(v: string) => handleMissingChange("eye_color", v)} />
              <TextInput label="Distinguishing Marks (Tattoos/Birthmarks)" value={data.missing_person.distinguishing_marks} onChange={(v: string) => handleMissingChange("distinguishing_marks", v)} />
            </div>
          </div>

          <div style={{ background: "#F8F4EF", padding: "20px", borderRadius: "12px", border: "1px solid #EDE8E1" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "15px", color: "var(--navy)" }}>Next of Kin / Contacts</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <TextInput label="Name" value={data.missing_person.next_of_kin_name} onChange={(v: string) => handleMissingChange("next_of_kin_name", v)} />
              <TextInput label="Relationship" value={data.missing_person.next_of_kin_relationship} onChange={(v: string) => handleMissingChange("next_of_kin_relationship", v)} />
              
              <div>
                <label style={{ display: "block", fontSize: "12px", color: "#7A8499", marginBottom: "6px" }}>Contact Number</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input 
                    type="text" 
                    value={data.missing_person.next_of_kin_contact || ""} 
                    onChange={(e) => handleMissingChange("next_of_kin_contact", e.target.value)} 
                    style={{ flex: 1, padding: "10px", borderRadius: "8px", border: "1px solid #D9D2C7", fontSize: "13px", boxSizing: "border-box" }}
                  />
                  <button 
                    onClick={notifyNextOfKin}
                    style={{ padding: "0 16px", background: "var(--navy)", color: "#fff", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                  >
                    Notify via SMS
                  </button>
                </div>
              </div>

              <TextInput label="Likely Destinations" value={data.missing_person.likely_destinations} onChange={(v: string) => handleMissingChange("likely_destinations", v)} />
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: CONSENTS */}
      {step === "consents" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <ConsentBox 
            title="BCC Housing Benefit Consent (CRITICAL)" 
            description="I give full consent to Birmingham City Council to check internally with DWP for benefits and discuss all matters relating to my Housing Benefit with Reliance Social Housing CIC."
            signedBy={data.consents.bcc_housing_benefit_consent_signed_by}
            date={data.consents.bcc_housing_benefit_consent_date}
            onChange={(sign: string, dt: string) => { handleConsentChange("bcc_housing_benefit_consent_signed_by", sign); handleConsentChange("bcc_housing_benefit_consent_date", dt); }}
            critical
          />
          <ConsentBox 
            title="Data Protection & Confidentiality" 
            description="I give consent to Reliance Social Housing CIC to hold and process personal information to perform the functions of the company."
            signedBy={data.consents.data_protection_signed_by}
            date={data.consents.data_protection_date}
            onChange={(sign: string, dt: string) => { handleConsentChange("data_protection_signed_by", sign); handleConsentChange("data_protection_date", dt); }}
          />
          <ConsentBox 
            title="Service Charge Agreement" 
            description="I agree to pay my service charge amount so I am entitled to my support and utilities."
            amount={data.consents.service_charge_amount || "25.00"}
            onAmountChange={(amt: string) => handleConsentChange("service_charge_amount", amt)}
            signedBy={data.consents.service_charge_agreement_signed_by}
            date={data.consents.service_charge_agreement_date}
            onChange={(sign: string, dt: string) => { handleConsentChange("service_charge_agreement_signed_by", sign); handleConsentChange("service_charge_agreement_date", dt); }}
          />
          <ConsentBox 
            title="Fire Evacuation Policy" 
            description="I understand the policy and acknowledge the fire procedure."
            signedBy={data.consents.fire_evacuation_signed_by}
            date={data.consents.fire_evacuation_date}
            onChange={(sign: string, dt: string) => { handleConsentChange("fire_evacuation_signed_by", sign); handleConsentChange("fire_evacuation_date", dt); }}
          />
        </div>
      )}

      {/* FOOTER */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "10px", borderTop: "2px solid #EDE8E1", paddingTop: "20px" }}>
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
          {saving ? "Saving…" : "Save Reliance Pack"}
        </button>

        <button
          onClick={handlePrint}
          style={{
            minHeight: "48px",
            padding: "0 24px",
            borderRadius: "8px",
            border: "1px solid var(--navy)",
            background: "#fff",
            color: "var(--navy)",
            fontWeight: 700,
            fontSize: "13px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          🖨️ Print Full Signup Pack
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

function TextInput({ label, value, onChange, type = "text" }: any) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "12px", color: "#7A8499", marginBottom: "6px" }}>{label}</label>
      <input 
        type={type} 
        value={value || ""} 
        onChange={(e) => onChange(e.target.value)} 
        style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #D9D2C7", fontSize: "13px", boxSizing: "border-box" }}
      />
    </div>
  );
}

function ConsentBox({ title, description, amount, onAmountChange, signedBy, date, onChange, critical }: any) {
  return (
    <div style={{ background: critical ? "#FEF2F2" : "#F8FAFC", border: `1px solid ${critical ? "#FCA5A5" : "#E2E8F0"}`, borderRadius: "12px", padding: "20px", breakInside: "avoid" }}>
      <h4 style={{ margin: "0 0 8px 0", color: critical ? "#991B1B" : "var(--navy)", fontSize: "14px", fontWeight: 700 }}>{title}</h4>
      <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: critical ? "#7F1D1D" : "#64748B" }}>{description}</p>
      
      {amount !== undefined && (
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "12px", color: "#7A8499", marginBottom: "6px" }}>Agreed Amount (£/week)</label>
          <input 
            type="number" 
            value={amount} 
            onChange={(e) => onAmountChange && onAmountChange(e.target.value)} 
            style={{ width: "150px", padding: "10px", borderRadius: "8px", border: "1px solid #CBD5E1", fontSize: "13px" }}
          />
        </div>
      )}

      <div>
        <DigitalSignaturePad 
          label="Client Signature (Draw below)"
          value={signedBy}
          onChange={(b64: string, dt: string) => onChange(b64, dt)}
        />
      </div>
    </div>
  );
}
