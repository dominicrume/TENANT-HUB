/**
 * LedgerTab — service charge ledger with a live balance strip computed from the
 * fetched rows (never hardcoded). Toggling a row PATCHes through writeWithAudit
 * and recomputes the balance instantly.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ServiceCharge } from "@tenant-hub/validation";
import { formatShortDate, formatMoney } from "../../lib/format";
import Link from "next/link";

const DEFAULT_WEEKLY = 150;

export function LedgerTab({ tenantId }: { tenantId: string }) {
  const [rows, setRows] = useState<ServiceCharge[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    Promise.all([
      fetch(`/api/service-charges?tenantId=${tenantId}`).then(res => res.ok ? res.json() : []),
      fetch(`/api/rent-payments?tenantId=${tenantId}`).then(res => res.ok ? res.json() : [])
    ]).then(([cData, pData]) => {
      setRows(cData);
      setPayments(pData);
    });
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const balance = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const totalPaid = payments.reduce((s, r) => s + Number(r.amount), 0);
    const totalCharged = rows.reduce((s, r) => s + Number(r.amount), 0);
    const outstanding = Math.max(0, totalCharged - totalPaid);
    const weeksBehind = Math.floor(outstanding / DEFAULT_WEEKLY);
    const weekly = rows.length ? Number(rows[rows.length - 1]!.amount) : DEFAULT_WEEKLY;
    return { totalPaid, outstanding, weeksBehind, weekly, arrears: totalPaid - totalCharged };
  }, [rows, payments]);

  async function toggle(row: ServiceCharge) {
    setBusy(true);
    await fetch(`/api/service-charges/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_paid: !row.is_paid }),
    });
    await load();
    setBusy(false);
  }

  async function addWeek() {
    setBusy(true);
    const last = rows[rows.length - 1];
    const base = last ? new Date(last.due_date) : new Date();
    if (last) base.setDate(base.getDate() + 7);
    const due = base.toISOString().slice(0, 10);
    await fetch("/api/service-charges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        week_label: `Week ${rows.length + 1}`,
        due_date: due,
        amount: DEFAULT_WEEKLY,
        is_paid: false,
      }),
    });
    await load();
    setBusy(false);
  }

  const stat = (label: string, value: string, color: string) => (
    <div style={{ flex: 1, minWidth: "120px" }}>
      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#9AA6BC" }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "20px", fontWeight: 600, color }}>{value}</div>
    </div>
  );

  return (
    <div className="ledger-print" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* BALANCE STRIP */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", background: "var(--navy)", borderRadius: "12px", padding: "16px" }}>
        {stat("Weekly Charge", formatMoney(balance.weekly), "#fff")}
        {stat("Total Paid", formatMoney(balance.totalPaid), "#34C87A")}
        {stat("Arrears Balance", formatMoney(balance.arrears), balance.arrears < 0 ? "#FF8B8B" : "#34C87A")}
        {stat("Weeks Behind", String(balance.weeksBehind), "#E8A84C")}
      </div>

      <div style={{ display: "flex", gap: "10px" }} className="no-print">
        <button onClick={addWeek} disabled={busy}
          style={{ minHeight: "44px", padding: "0 16px", borderRadius: "8px", border: "1px solid #EDE8E1", background: "#fff", color: "var(--navy)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
          + Add Week
        </button>
        <Link href={`/tenants/${tenantId}/statement`}
          className="no-print"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "44px", padding: "0 16px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", fontWeight: 600, fontSize: "13px", cursor: "pointer", textDecoration: "none" }}>
          🖨 Generate Statement
        </Link>
      </div>

      {/* RENT PAYMENTS */}
      <h3 style={{ fontSize: "14px", color: "var(--navy)", margin: "16px 0 8px 0" }}>Recent Payments</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", marginBottom: "24px" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#7A8499", fontSize: "11px", textTransform: "uppercase" }}>
            <th style={{ padding: "8px 6px" }}>Date</th>
            <th style={{ padding: "8px 6px" }}>Type</th>
            <th style={{ padding: "8px 6px" }}>Amount</th>
            <th style={{ padding: "8px 6px" }}>Reference</th>
          </tr>
        </thead>
        <tbody>
          {payments.length === 0 ? (
            <tr><td colSpan={4} style={{ padding: "12px 6px", color: "#7A8499" }}>No payments recorded.</td></tr>
          ) : (
            payments.map((p) => (
              <tr key={p.id} style={{ borderTop: "1px solid #F3EEE7" }}>
                <td style={{ padding: "8px 6px", fontFamily: "'JetBrains Mono',monospace", color: "var(--navy)" }}>{formatShortDate(p.payment_date)}</td>
                <td style={{ padding: "8px 6px" }}>{p.payment_type}</td>
                <td style={{ padding: "8px 6px", fontFamily: "'JetBrains Mono',monospace", color: "#34C87A", fontWeight: 600 }}>+{formatMoney(p.amount)}</td>
                <td style={{ padding: "8px 6px", color: "#7A8499" }}>{p.reference_note || "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* TABLE */}
      <h3 style={{ fontSize: "14px", color: "var(--navy)", margin: "8px 0" }}>Service Charges</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#7A8499", fontSize: "11px", textTransform: "uppercase" }}>
            <th style={{ padding: "8px 6px" }}>Week</th>
            <th style={{ padding: "8px 6px" }}>Due Date</th>
            <th style={{ padding: "8px 6px" }}>Amount</th>
            <th style={{ padding: "8px 6px" }}>Status</th>
            <th style={{ padding: "8px 6px" }}>Paid Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} style={{ padding: "12px 6px", color: "#7A8499" }}>No charges yet. Add the first week.</td></tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #F3EEE7" }}>
                <td style={{ padding: "8px 6px", color: "var(--navy)" }}>{r.week_label}</td>
                <td style={{ padding: "8px 6px", fontFamily: "'JetBrains Mono',monospace" }}>{formatShortDate(r.due_date)}</td>
                <td style={{ padding: "8px 6px", fontFamily: "'JetBrains Mono',monospace", color: "#E05252" }}>-{formatMoney(r.amount)}</td>
                <td style={{ padding: "8px 6px" }}>
                  <button onClick={() => toggle(r)} disabled={busy} className="no-print"
                    style={{
                      border: "none", cursor: "pointer", borderRadius: "20px", padding: "3px 10px", fontSize: "12px", fontWeight: 600,
                      background: r.is_paid ? "rgba(52,200,122,0.15)" : "rgba(224,82,82,0.12)",
                      color: r.is_paid ? "#1E7F4F" : "#E05252",
                    }}>
                    {r.is_paid ? "✓ Paid" : "✗ Unpaid"}
                  </button>
                </td>
                <td style={{ padding: "8px 6px", fontFamily: "'JetBrains Mono',monospace", color: "#7A8499" }}>
                  {r.paid_date ? formatShortDate(r.paid_date) : "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
