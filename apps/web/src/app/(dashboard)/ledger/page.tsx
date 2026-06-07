"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTenants } from "../../../hooks/useTenants";

export default function LedgerIndexPage() {
  const { tenants } = useTenants();
  const [charges, setCharges] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showPayment, setShowPayment] = useState(false);
  const [showCharge, setShowCharge] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/service-charges").then(res => res.ok ? res.json() : []),
      fetch("/api/rent-payments/balances").then(res => res.ok ? res.json() : [])
    ]).then(([cData, bData]) => {
      setCharges(cData);
      setBalances(bData);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleRecordPayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      tenant_id: fd.get("tenant_id"),
      amount: Number(fd.get("amount")),
      payment_type: fd.get("payment_type"),
      payment_date: fd.get("payment_date"),
      reference_note: fd.get("reference_note") || "",
    };
    await fetch("/api/rent-payments", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    window.location.reload();
  }

  async function handleAddCharge(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      tenant_id: fd.get("tenant_id"),
      week_label: fd.get("week_label"),
      due_date: fd.get("due_date"),
      amount: Number(fd.get("amount")),
      is_paid: false
    };
    await fetch("/api/service-charges", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    window.location.reload();
  }

  if (loading) return <div style={{ padding: "32px", fontFamily: "'Sora', sans-serif" }}>Loading ledger...</div>;

  return (
    <div style={{ padding: "32px", fontFamily: "'Sora', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ color: "var(--navy)", margin: 0 }}>Global Ledger</h1>
        <div style={{ display: "flex", gap: "12px" }}>
          <button onClick={() => setShowCharge(true)} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #EDE8E1", background: "#fff", cursor: "pointer", fontWeight: 600, color: "var(--navy)" }}>+ Add Charge</button>
          <button onClick={() => setShowPayment(true)} style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Record Payment</button>
        </div>
      </div>
      
      {/* Balances Overview */}
      <h3 style={{ color: "var(--navy)", marginBottom: "16px" }}>Tenant Arrears</h3>
      <div style={{ display: "flex", gap: "16px", marginBottom: "32px", overflowX: "auto" }}>
        {balances.filter(b => b.balance < 0).map(b => (
          <div key={b.tenant_id} style={{ minWidth: "200px", background: "#fff", padding: "16px", borderRadius: "12px", border: "1px solid #E05252" }}>
            <div style={{ fontSize: "12px", color: "#7A8499", marginBottom: "4px" }}>{tenants.find(t => t.id === b.tenant_id)?.full_name || "Unknown"}</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#E05252" }}>-£{Math.abs(b.balance).toFixed(2)}</div>
            <div style={{ fontSize: "11px", color: "#E05252", marginTop: "4px" }}>In Arrears</div>
          </div>
        ))}
        {balances.length === 0 && <p style={{ color: "#7A8499", fontSize: "13px" }}>No balance records.</p>}
        {balances.length > 0 && balances.filter(b => b.balance < 0).length === 0 && <p style={{ color: "#2CA162", fontSize: "13px" }}>All tenants are up to date on payments!</p>}
      </div>

      <h3 style={{ color: "var(--navy)", marginBottom: "16px" }}>Recent Charges</h3>
      {charges.length === 0 ? (
        <p style={{ color: "#7A8499" }}>No service charges recorded.</p>
      ) : (
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #EDE8E1", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#F8F4EF", color: "#7A8499", textAlign: "left" }}>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Due Date</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Tenant</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Week Label</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Amount (£)</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {charges.map(c => {
                const tenantName = tenants.find(t => t.id === c.tenant_id)?.full_name ?? "Unknown";
                return (
                  <tr key={c.id} style={{ borderTop: "1px solid #EDE8E1" }}>
                    <td style={{ padding: "12px 16px", color: "var(--navy)", fontWeight: 500 }}>
                      {c.due_date}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <Link href={`/tenants/${c.tenant_id}?tab=ledger`} style={{ color: "var(--navy)", fontWeight: 600, textDecoration: "none" }}>
                        {tenantName}
                      </Link>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#475569" }}>
                      {c.week_label}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#475569" }}>
                      £{c.amount}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ 
                        padding: "4px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700,
                        background: c.is_paid ? "rgba(52,200,122,0.15)" : "rgba(224,82,82,0.15)",
                        color: c.is_paid ? "#2CA162" : "#E05252"
                      }}>
                        {c.is_paid ? "PAID" : "UNPAID"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPayment && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <form onSubmit={handleRecordPayment} style={{ background: "#fff", padding: "24px", borderRadius: "12px", width: "400px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <h3 style={{ margin: 0, color: "var(--navy)" }}>Record Payment</h3>
            <select name="tenant_id" required style={{ padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1" }}>
              <option value="">Select Tenant</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
            <input name="amount" type="number" step="0.01" placeholder="Amount (£)" required style={{ padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1" }} />
            <select name="payment_type" required style={{ padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1" }}>
              <option value="Housing Benefit">Housing Benefit</option>
              <option value="Universal Credit">Universal Credit</option>
              <option value="Tenant Top-up">Tenant Top-up</option>
              <option value="Other">Other</option>
            </select>
            <input name="payment_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} style={{ padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1" }} />
            <input name="reference_note" placeholder="Reference / Notes" style={{ padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1" }} />
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px" }}>
              <button type="button" onClick={() => setShowPayment(false)} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "transparent", cursor: "pointer", color: "#7A8499", fontWeight: 600 }}>Cancel</button>
              <button type="submit" disabled={busy} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "var(--navy)", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Save Payment</button>
            </div>
          </form>
        </div>
      )}

      {/* Add Charge Modal */}
      {showCharge && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <form onSubmit={handleAddCharge} style={{ background: "#fff", padding: "24px", borderRadius: "12px", width: "400px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <h3 style={{ margin: 0, color: "var(--navy)" }}>Add Service Charge</h3>
            <select name="tenant_id" required style={{ padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1" }}>
              <option value="">Select Tenant</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
            <input name="week_label" placeholder="Week Label (e.g. Week 42)" required style={{ padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1" }} />
            <input name="amount" type="number" step="0.01" defaultValue="15.00" required style={{ padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1" }} />
            <input name="due_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} style={{ padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1" }} />
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px" }}>
              <button type="button" onClick={() => setShowCharge(false)} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "transparent", cursor: "pointer", color: "#7A8499", fontWeight: 600 }}>Cancel</button>
              <button type="submit" disabled={busy} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "var(--navy)", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Save Charge</button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
