/**
 * EvictionNoticeModal — two-step: confirmation, then an editable official notice
 * preview on the current letterhead. Generate & Print records an EXPORT audit
 * event (H1) then window.print(). Danger-styled.
 */
"use client";

import { useState } from "react";
import type { CanonicalTenant } from "@tenant-hub/validation";
import { useBrand } from "../contexts/BrandContext";
import { LetterheadBlock } from "./LetterheadBlock";
import { formatUkDate } from "../lib/format";

export function EvictionNoticeModal({
  tenant,
  open,
  onClose,
}: {
  tenant: CanonicalTenant;
  open: boolean;
  onClose: () => void;
}) {
  const { label } = useBrand();
  const [step, setStep] = useState<1 | 2>(1);
  const [noticeDays, setNoticeDays] = useState("28");
  const [reason, setReason] = useState("");
  const [effective, setEffective] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function generate() {
    setBusy(true);
    await fetch("/api/eviction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: tenant.id, reason, noticeDays, effective }),
    });
    setBusy(false);
    window.print();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,28,46,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: "14px", padding: "1.5rem", width: "100%", maxWidth: step === 1 ? "440px" : "640px", maxHeight: "90vh", overflowY: "auto" }}>
        {step === 1 ? (
          <>
            <h2 style={{ color: "#E05252", fontSize: "18px", fontWeight: 700 }}>⚠️ Issue Eviction Notice</h2>
            <p style={{ fontSize: "13px", color: "#445", marginTop: "10px", lineHeight: 1.6 }}>
              This will generate an official notice for <strong>{tenant.full_name}</strong> at{" "}
              <strong>{tenant.room_number}</strong>. This action is recorded in the audit trail.
            </p>
            <div style={{ display: "flex", gap: "10px", marginTop: "18px", justifyContent: "flex-end" }} className="no-print">
              <button onClick={onClose} style={{ minHeight: "44px", padding: "0 16px", borderRadius: "8px", border: "1px solid #EDE8E1", background: "#fff", color: "#7A8499", cursor: "pointer" }}>Cancel</button>
              <button onClick={() => setStep(2)} style={{ minHeight: "44px", padding: "0 16px", borderRadius: "8px", border: "none", background: "#E05252", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Generate Notice</button>
            </div>
          </>
        ) : (
          <div className="print-area">
            <LetterheadBlock roomNumber={tenant.room_number} date={formatUkDate(new Date())} />
            <h2 style={{ color: "var(--navy)", fontSize: "18px", fontWeight: 700, margin: "16px 0" }}>Notice Seeking Possession</h2>
            <div style={{ fontSize: "13px", color: "#334", lineHeight: 1.7 }}>
              <p>Date: {formatUkDate(new Date())}</p>
              <p>To: {tenant.full_name}</p>
              <p>Address: {tenant.address}, {tenant.room_number}</p>
              <div style={{ display: "flex", gap: "12px", margin: "10px 0", flexWrap: "wrap" }} className="no-print">
                <label style={{ fontSize: "12px" }}>Notice period (days)
                  <input value={noticeDays} onChange={(e) => setNoticeDays(e.target.value)} style={{ display: "block", minHeight: "40px", padding: "6px 10px", borderRadius: "8px", border: "1px solid #EDE8E1", marginTop: "4px" }} />
                </label>
                <label style={{ fontSize: "12px" }}>Effective date
                  <input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} style={{ display: "block", minHeight: "40px", padding: "6px 10px", borderRadius: "8px", border: "1px solid #EDE8E1", marginTop: "4px" }} />
                </label>
              </div>
              <p className="print-only" style={{ display: "none" }}>Notice period: {noticeDays} days · Effective: {effective || "—"}</p>
              <label style={{ display: "block", fontSize: "12px", marginTop: "6px" }} className="no-print">Reason (required)
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} required style={{ display: "block", width: "100%", minHeight: "80px", padding: "8px", borderRadius: "8px", border: "1px solid #EDE8E1", marginTop: "4px", boxSizing: "border-box" }} />
              </label>
              <p>Reason: {reason || "—"}</p>
              <p style={{ marginTop: "16px" }}>You are required to give up possession after the notice period stated above.</p>
              <p style={{ marginTop: "24px", fontWeight: 600, color: "var(--navy)" }}>
                On behalf of {label} — AHSAN REHMAN
              </p>
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "18px", justifyContent: "flex-end" }} className="no-print">
              <button onClick={onClose} style={{ minHeight: "44px", padding: "0 16px", borderRadius: "8px", border: "1px solid #EDE8E1", background: "#fff", color: "#7A8499", cursor: "pointer" }}>Close</button>
              <button onClick={generate} disabled={busy || !reason.trim()} style={{ minHeight: "44px", padding: "0 16px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", fontWeight: 700, cursor: busy || !reason.trim() ? "not-allowed" : "pointer" }}>
                {busy ? "Recording…" : "Generate & Print"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
