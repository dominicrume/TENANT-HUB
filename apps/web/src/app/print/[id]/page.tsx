"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CanonicalTenant, ReliancePack } from "@tenant-hub/validation";

export default function PrintPackPage() {
  const params = useParams();
  const id = params.id as string;
  const [tenant, setTenant] = useState<CanonicalTenant | null>(null);
  const [pack, setPack] = useState<ReliancePack | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [tRes, fRes] = await Promise.all([
        fetch(`/api/tenants/${id}`),
        fetch(`/api/tenants/${id}/forms`)
      ]);
      if (tRes.ok) {
        setTenant(await tRes.json());
      }
      if (fRes.ok) {
        const forms = await fRes.json();
        const match = forms.find((f: any) => f.template_id === "reliance-intake-pack");
        if (match && match.data) {
          setPack(match.data);
        }
      }
      setLoading(false);
    }
    void load();
  }, [id]);

  if (loading) return <div style={{ padding: "40px" }}>Loading printable pack...</div>;
  if (!tenant || !pack) return <div style={{ padding: "40px", color: "red" }}>No Reliance Pack found for this tenant.</div>;

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "40px", fontFamily: "sans-serif", background: "#fff", color: "#000" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white; margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
          .print-section { margin-bottom: 40px; page-break-inside: avoid; }
        }
      `}} />

      <div className="no-print" style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Print Preview: Reliance Intake Pack</h2>
        <button 
          onClick={() => window.print()}
          style={{ padding: "10px 20px", background: "var(--navy)", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
        >
          Print to PDF
        </button>
      </div>

      <div className="print-section">
        <h1 style={{ borderBottom: "2px solid #000", paddingBottom: "10px", marginBottom: "20px" }}>RELIANCE SOCIAL HOUSING CIC - INITIAL ASSESSMENT</h1>
        <Grid>
          <Field label="Full Name" value={tenant.full_name || `${pack.referral?.first_name || ''} ${pack.referral?.surname || ''}`.trim()} />
          <Field label="NINO" value={pack.referral?.nino || tenant.nino} />
          <Field label="Date of Birth" value={pack.referral?.dob || tenant.dob} />
          <Field label="Contact Number" value={pack.referral?.mobile_no || tenant.mobile} />
          <Field label="Registered GP" value={pack.referral?.registered_gp || tenant.doctor} />
        </Grid>
        <h3 style={{ marginTop: "20px", borderBottom: "1px solid #ccc" }}>Health & Support Needs</h3>
        <Grid>
          <Field label="Physical Health" value={pack.referral?.physical_health} />
          <Field label="Mental Health" value={pack.referral?.mental_health} />
          <Field label="Medication" value={pack.referral?.medication} />
          <Field label="Uses Drugs" value={pack.referral?.uses_drugs ? "Yes" : "No"} />
          <Field label="Uses Alcohol" value={pack.referral?.uses_alcohol ? "Yes" : "No"} />
        </Grid>
      </div>

      <div className="page-break"></div>

      <div className="print-section">
        <h1 style={{ borderBottom: "2px solid #000", paddingBottom: "10px", marginBottom: "20px" }}>MISSING PERSON RECORD</h1>
        <Grid>
          <Field label="Height" value={pack.missing_person?.height} />
          <Field label="Build" value={pack.missing_person?.build} />
          <Field label="Hair Color" value={pack.missing_person?.hair_color} />
          <Field label="Eye Color" value={pack.missing_person?.eye_color} />
          <Field label="Distinguishing Marks" value={pack.missing_person?.distinguishing_marks} />
        </Grid>
        <h3 style={{ marginTop: "20px", borderBottom: "1px solid #ccc" }}>Next of Kin / Contacts</h3>
        <Grid>
          <Field label="Name" value={pack.missing_person?.next_of_kin_name} />
          <Field label="Relationship" value={pack.missing_person?.next_of_kin_relationship} />
          <Field label="Contact Number" value={pack.missing_person?.next_of_kin_contact} />
          <Field label="Likely Destinations" value={pack.missing_person?.likely_destinations} />
        </Grid>
      </div>

      <div className="page-break"></div>

      <div className="print-section">
        <h1 style={{ borderBottom: "2px solid #000", paddingBottom: "10px", marginBottom: "20px" }}>CONSENTS & POLICIES</h1>
        
        <ConsentItem 
          title="BCC Housing Benefit Consent" 
          description="I give full consent to Birmingham City Council to check internally with DWP for benefits and discuss all matters relating to my Housing Benefit with Reliance Social Housing CIC."
          signature={pack.consents?.bcc_housing_benefit_consent_signed_by}
          date={pack.consents?.bcc_housing_benefit_consent_date}
        />
        
        <ConsentItem 
          title="Data Protection & Confidentiality" 
          description="I give consent to Reliance Social Housing CIC to hold and process personal information to perform the functions of the company."
          signature={pack.consents?.data_protection_signed_by}
          date={pack.consents?.data_protection_date}
        />

        <ConsentItem 
          title="Service Charge Agreement" 
          description={`I agree to pay my service charge amount of £${pack.consents?.service_charge_amount || "25.00"} per week so I am entitled to my support and utilities.`}
          signature={pack.consents?.service_charge_agreement_signed_by}
          date={pack.consents?.service_charge_agreement_date}
        />

        <ConsentItem 
          title="Fire Evacuation Policy" 
          description="I understand the policy and acknowledge the fire procedure."
          signature={pack.consents?.fire_evacuation_signed_by}
          date={pack.consents?.fire_evacuation_date}
        />
      </div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>{children}</div>;
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div style={{ fontSize: "12px", color: "#666", fontWeight: "bold" }}>{label}</div>
      <div style={{ fontSize: "14px", padding: "8px", border: "1px solid #ddd", minHeight: "20px", marginTop: "4px" }}>
        {value || "—"}
      </div>
    </div>
  );
}

function ConsentItem({ title, description, signature, date }: any) {
  return (
    <div style={{ border: "1px solid #000", padding: "16px", marginBottom: "20px" }}>
      <h3>{title}</h3>
      <p>{description}</p>
      <div style={{ marginTop: "20px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ borderBottom: "1px solid #000", minWidth: "250px", minHeight: "60px", position: "relative" }}>
          {signature?.startsWith("data:image") ? (
            <img src={signature} alt="Signature" style={{ maxHeight: "60px", position: "absolute", bottom: "0" }} />
          ) : (
            <span style={{ fontFamily: "cursive", position: "absolute", bottom: "5px" }}>{signature}</span>
          )}
        </div>
        <div style={{ borderBottom: "1px solid #000", minWidth: "150px" }}>
          Date: {date || ""}
        </div>
      </div>
    </div>
  );
}
