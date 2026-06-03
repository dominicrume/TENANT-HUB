/**
 * Monthly Council Report — pick a tenant + month, generate a printable report
 * (letterhead, sessions, charges). Print/Export both use window.print().
 */
"use client";

import { useState } from "react";
import type { CanonicalTenant, Session, ServiceCharge } from "@tenant-hub/validation";
import { useTenants } from "../../../hooks/useTenants";
import { LetterheadBlock } from "../../../components/LetterheadBlock";
import { formatShortDate, formatMoney } from "../../../lib/format";

interface ReportData {
  tenant: CanonicalTenant;
  sessions: Session[];
  charges: ServiceCharge[];
}

export default function ReportsPage() {
  const { activeTenants } = useTenants();
  const [tenantId, setTenantId] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [report, setReport] = useState<ReportData | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (!tenantId) return;
    setBusy(true);
    const res = await fetch(`/api/reports?tenantId=${tenantId}&month=${month}`);
    if (res.ok) setReport((await res.json()) as ReportData);
    setBusy(false);
  }

  return (
    <div style={{ padding: "1.75rem", fontFamily: "'Sora', sans-serif" }}>
      <h1 style={{ color: "var(--navy)", fontSize: "22px", fontWeight: 700, marginBottom: "14px" }} className="no-print">
        Monthly Council Report
      </h1>

      <div className="no-print" style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "18px" }}>
        <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}
          style={{ minHeight: "44px", padding: "8px 11px", borderRadius: "8px", border: "1px solid #EDE8E1" }}>
          <option value="">Select tenant…</option>
          {activeTenants.map((t) => <option key={t.id} value={t.id}>{t.full_name} · {t.room_number}</option>)}
        </select>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          style={{ minHeight: "44px", padding: "8px 11px", borderRadius: "8px", border: "1px solid #EDE8E1" }} />
        <button onClick={generate} disabled={busy || !tenantId}
          style={{ minHeight: "44px", padding: "0 18px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", fontWeight: 600, cursor: busy || !tenantId ? "not-allowed" : "pointer" }}>
          {busy ? "Generating…" : "Generate Report"}
        </button>
        {report && (
          <button onClick={() => window.print()}
            style={{ minHeight: "44px", padding: "0 18px", borderRadius: "8px", border: "1px solid #EDE8E1", background: "#fff", color: "var(--navy)", fontWeight: 600, cursor: "pointer" }}>
            🖨 Print / Export PDF
          </button>
        )}
      </div>

      {report && (
        <div className="print-area" style={{ background: "var(--surface)", border: "1px solid #EDE8E1", borderRadius: "12px", padding: "20px", maxWidth: "760px" }}>
          <LetterheadBlock roomNumber={report.tenant.room_number} date={month} />

          <h2 style={{ color: "var(--navy)", fontSize: "16px", fontWeight: 700, margin: "16px 0 4px" }}>
            {report.tenant.full_name}
          </h2>
          <p style={{ fontSize: "12px", color: "#7A8499", marginBottom: "16px" }}>
            {report.tenant.room_number} · Benefit: {report.tenant.benefit_type}
          </p>

          <h3 style={{ fontSize: "13px", fontWeight: 700, color: "var(--amber)", marginBottom: "6px" }}>Sessions</h3>
          {report.sessions.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#7A8499", marginBottom: "14px" }}>No sessions this month.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginBottom: "16px" }}>
              <thead><tr style={{ textAlign: "left", color: "#7A8499" }}><th style={{ padding: "4px" }}>Date</th><th style={{ padding: "4px" }}>Type</th><th style={{ padding: "4px" }}>Notes</th></tr></thead>
              <tbody>
                {report.sessions.map((s) => (
                  <tr key={s.id} style={{ borderTop: "1px solid #F3EEE7" }}>
                    <td style={{ padding: "4px", fontFamily: "'JetBrains Mono',monospace" }}>{formatShortDate(s.session_date)}</td>
                    <td style={{ padding: "4px" }}>{s.session_type}</td>
                    <td style={{ padding: "4px" }}>{s.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 style={{ fontSize: "13px", fontWeight: 700, color: "var(--amber)", marginBottom: "6px" }}>Service Charges</h3>
          {report.charges.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#7A8499" }}>No charges this month.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead><tr style={{ textAlign: "left", color: "#7A8499" }}><th style={{ padding: "4px" }}>Week</th><th style={{ padding: "4px" }}>Due</th><th style={{ padding: "4px" }}>Amount</th><th style={{ padding: "4px" }}>Status</th></tr></thead>
              <tbody>
                {report.charges.map((c) => (
                  <tr key={c.id} style={{ borderTop: "1px solid #F3EEE7" }}>
                    <td style={{ padding: "4px" }}>{c.week_label}</td>
                    <td style={{ padding: "4px", fontFamily: "'JetBrains Mono',monospace" }}>{formatShortDate(c.due_date)}</td>
                    <td style={{ padding: "4px", fontFamily: "'JetBrains Mono',monospace" }}>{formatMoney(c.amount)}</td>
                    <td style={{ padding: "4px", color: c.is_paid ? "#1E7F4F" : "#E05252" }}>{c.is_paid ? "Paid" : "Unpaid"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: "28px", fontSize: "12px", color: "var(--navy)" }}>
            <div style={{ borderTop: "1px solid #EDE8E1", paddingTop: "10px" }}>Signed: ______________________________</div>
            <div style={{ marginTop: "8px" }}>On behalf of the housing association.</div>
          </div>
        </div>
      )}
    </div>
  );
}
