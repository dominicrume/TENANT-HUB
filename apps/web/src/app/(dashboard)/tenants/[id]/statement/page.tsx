/**
 * Statement of account — a printable running ledger for one tenant, built from
 * the real charges and payments (never hard-coded), under the active letterhead.
 * Replaces a placeholder that printed a fictional tenant and address.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import type { CanonicalTenant, ServiceCharge } from "@tenant-hub/validation";
import { LetterheadBlock } from "../../../../../components/LetterheadBlock";
import { formatMoney, formatShortDate } from "../../../../../lib/format";

interface Payment { id: string; amount: number | string; payment_type: string; payment_date: string; reference_note?: string | null }
interface Line { date: string; description: string; charge: number; payment: number }

export default function StatementPage({ params }: { params: { id: string } }) {
  const [tenant, setTenant] = useState<CanonicalTenant | null>(null);
  const [charges, setCharges] = useState<ServiceCharge[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`/api/tenants/${params.id}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("Couldn't load this tenant")))),
      fetch(`/api/service-charges?tenantId=${params.id}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/rent-payments?tenantId=${params.id}`).then((r) => (r.ok ? r.json() : [])),
    ]).then(([t, c, p]) => { if (!alive) return; setTenant(t); setCharges(c); setPayments(p); })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [params.id]);

  const lines = useMemo<Line[]>(() => {
    const out: Line[] = [
      ...charges.map((c) => ({ date: c.due_date, description: `Service charge · ${c.week_label}`, charge: Number(c.amount), payment: 0 })),
      ...payments.map((p) => ({ date: p.payment_date, description: `Payment received · ${p.payment_type}${p.reference_note ? ` (${p.reference_note})` : ""}`, charge: 0, payment: Number(p.amount) })),
    ];
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [charges, payments]);

  const totals = useMemo(() => {
    const charged = lines.reduce((s, l) => s + l.charge, 0);
    const paid = lines.reduce((s, l) => s + l.payment, 0);
    return { charged, paid, balance: paid - charged };
  }, [lines]);

  if (loading) return <div className="canvas"><p className="sub">Preparing the statement…</p></div>;
  if (error || !tenant) return <div className="canvas"><p className="form-error">{error ?? "Couldn't load this tenant."}</p></div>;

  let running = 0;
  return (
    <div className="print-area" style={{ maxWidth: 820, margin: "0 auto", padding: "28px 24px 60px", background: "var(--surface)", color: "var(--ink)", fontFamily: "'Sora',sans-serif" }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button type="button" className="btn" onClick={() => window.print()}>Print or save as PDF</button>
      </div>

      <LetterheadBlock roomNumber={tenant.room_number} date={formatShortDate(new Date().toISOString())} />

      <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.5, margin: "22px 0 2px", color: "var(--navy)" }}>Statement of account</h1>
      <p className="sub">Service charges and payments on this record.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 22 }}>
        <div style={{ background: "var(--cream)", borderRadius: 12, padding: 16 }}>
          <div className="eyebrow" style={{ margin: "0 0 6px" }}>Account holder</div>
          <div style={{ fontWeight: 600 }}>{tenant.full_name}</div>
          <div className="muted">{[tenant.room_number ? `Room ${tenant.room_number}` : null, tenant.address].filter(Boolean).join(", ") || "—"}</div>
          {tenant.nino && <div className="muted" style={{ fontFamily: "'JetBrains Mono',monospace" }}>NINO {tenant.nino}</div>}
        </div>
        <div style={{ background: "var(--cream)", borderRadius: 12, padding: 16 }}>
          <div className="eyebrow" style={{ margin: "0 0 6px" }}>Summary</div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Charged</span><span>{formatMoney(totals.charged)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Paid</span><span>{formatMoney(totals.paid)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line)", fontWeight: 600 }}>
            <span>{totals.balance < 0 ? "Owed" : "In credit"}</span>
            <span style={{ color: totals.balance < 0 ? "var(--brick)" : "var(--live)" }}>{formatMoney(Math.abs(totals.balance))}</span>
          </div>
        </div>
      </div>

      {lines.length === 0 ? <p className="muted">Nothing on this account yet.</p> : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ textAlign: "left", color: "var(--slate)", borderBottom: "2px solid var(--navy)" }}>
            <th style={{ padding: "8px 6px" }}>Date</th><th style={{ padding: "8px 6px" }}>What</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>Charge</th><th style={{ padding: "8px 6px", textAlign: "right" }}>Payment</th><th style={{ padding: "8px 6px", textAlign: "right" }}>Balance</th></tr></thead>
          <tbody>
            {lines.map((l, i) => { running += l.payment - l.charge; return (
              <tr key={i} style={{ borderBottom: "1px solid var(--line-soft)", background: l.payment ? "rgba(46,158,107,.05)" : undefined }}>
                <td style={{ padding: "9px 6px", fontFamily: "'JetBrains Mono',monospace" }}>{formatShortDate(l.date)}</td>
                <td style={{ padding: "9px 6px" }}>{l.description}</td>
                <td style={{ padding: "9px 6px", textAlign: "right", fontFamily: "'JetBrains Mono',monospace" }}>{l.charge ? formatMoney(l.charge) : "—"}</td>
                <td style={{ padding: "9px 6px", textAlign: "right", fontFamily: "'JetBrains Mono',monospace", color: "var(--live)" }}>{l.payment ? formatMoney(l.payment) : "—"}</td>
                <td style={{ padding: "9px 6px", textAlign: "right", fontFamily: "'JetBrains Mono',monospace", color: running < 0 ? "var(--brick)" : "var(--live)" }}>{running < 0 ? "-" : ""}{formatMoney(Math.abs(running))}</td>
              </tr>); })}
          </tbody>
        </table>
      )}

      <p className="foothint">Generated by the system from the record; no signature needed. Questions: speak to your support worker.</p>
    </div>
  );
}
