"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { CanonicalTenant } from "@tenant-hub/validation";
import { LetterheadBlock } from "../../../../../components/LetterheadBlock";

export default function PrintDossierPage() {
  const { id } = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<CanonicalTenant | null>(null);
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [tRes, fRes] = await Promise.all([
      fetch(`/api/tenants/${id}`),
      fetch(`/api/tenants/${id}/forms`)
    ]);

    if (tRes.ok) setTenant(await tRes.json());
    if (fRes.ok) setForms(await fRes.json());
    
    setLoading(false);
    
    // Automatically trigger print dialog when loaded
    setTimeout(() => {
      window.print();
    }, 500);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <div style={{ padding: 40 }}>Generating Dossier...</div>;
  if (!tenant) return <div style={{ padding: 40 }}>Failed to load tenant.</div>;

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "40px", fontFamily: "'Sora', sans-serif" }}>
      <LetterheadBlock roomNumber={tenant.room_number} date={new Date().toLocaleDateString("en-GB")} />
      
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: "var(--navy)", margin: "40px 0 20px" }}>
        Tenant Dossier: {tenant.full_name}
      </h1>

      <div style={{ marginBottom: "40px", fontSize: "14px", lineHeight: "1.6" }}>
        <h2 style={{ fontSize: "18px", borderBottom: "2px solid #EEE", paddingBottom: "10px", marginBottom: "20px" }}>Personal Details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div><strong>DOB:</strong> {tenant.dob}</div>
          <div><strong>NI Number:</strong> {tenant.nino}</div>
          <div><strong>Nationality:</strong> {tenant.nationality}</div>
          <div><strong>Moved In:</strong> {tenant.moved_in}</div>
          <div><strong>Room Number:</strong> {tenant.room_number}</div>
          <div><strong>Mobile:</strong> {tenant.mobile}</div>
          <div><strong>Benefit Type:</strong> {tenant.benefit_type}</div>
          <div><strong>Next of Kin:</strong> {tenant.nok_name} ({tenant.nok_phone})</div>
          <div><strong>Doctor:</strong> {tenant.doctor}</div>
        </div>
      </div>

      {forms.map((form) => (
        <div key={form.id} style={{ marginBottom: "40px", pageBreakInside: "avoid" }}>
          <h2 style={{ fontSize: "18px", borderBottom: "2px solid #EEE", paddingBottom: "10px", marginBottom: "20px" }}>
            {form.template?.name || "Custom Form"}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "14px" }}>
            {form.template?.schema?.map((field: any) => (
              <div key={field.id} style={{ fontSize: "14px", background: "#f8f9fa", padding: "12px", borderRadius: "8px" }}>
                <strong style={{ display: "block", color: "var(--navy)", marginBottom: "4px" }}>{field.label}</strong>
                <div>{form.data?.[field.id]?.toString() || <span style={{ color: "#aaa" }}>Not provided</span>}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="no-print" style={{ textAlign: "center", marginTop: "40px" }}>
        <button 
          onClick={() => window.close()} 
          style={{ padding: "12px 24px", background: "#E05252", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}
        >
          Close Tab
        </button>
      </div>
    </div>
  );
}
