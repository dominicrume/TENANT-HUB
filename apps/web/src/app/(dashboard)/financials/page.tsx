/**
 * Financials — the money the way a managing agent reads it (Matloob,
 * 2026-10-14): rent roll, this month in and out, who owes what, by
 * landlord and by property. The ledger (every charge and payment) is one
 * click away; statements and CSVs live there.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatMoney, formatShortDate } from "../../../lib/format";

interface Fin {
  monthStart: string;
  totals: { rentRollMonthly: number; activeTenancies: number; monthCharged: number; monthPaid: number; owed: number; inArrears: number; allTimeCharged: number; allTimePaid: number };
  byLandlord: Array<{ landlordId: string | null; landlord: string; properties: number; tenants: number; monthlyRoll: number; charged: number; paid: number }>;
  byProperty: Array<{ propertyId: string; property: string; landlord: string; tenants: number; monthlyRoll: number; charged: number; paid: number; balance: number }>;
  arrears: Array<{ tenantId: string; name: string; room: string | null; owed: number }>;
  recentPayments: Array<{ id: string; amount: number; payment_type: string; payment_date: string; full_name: string; tenant_id: string }>;
}

export default function FinancialsPage() {
  const [data, setData] = useState<Fin | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/financials").then(async (r) => { const b = await r.json().catch(() => null); if (!r.ok) setError(b?.error ?? "Couldn't load"); else setData(b); }).catch(() => setError("Could not reach the server."));
  }, []);
  if (error) return <div style={{ padding: "1.75rem" }}><p style={{ color: "var(--brick)" }}>{error}</p></div>;
  if (!data) return <div style={{ padding: "1.75rem" }}><p className="muted">Adding it up…</p></div>;
  const { totals: t } = data;
  const monthName = new Date(data.monthStart + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const collectedPct = t.monthCharged > 0 ? Math.min(100, Math.round((t.monthPaid / t.monthCharged) * 100)) : null;

  return (
    <div style={{ padding: "1.75rem", maxWidth: 1000 }}>
      <div className="ch" style={{ padding: 0, marginBottom: 6, border: "none", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ margin: 0 }}>Financials</h1>
        <div className="btns"><Link href="/ledger" className="btn ghost sm">Open the ledger</Link><Link href="/ledger" className="rel sm">Record a payment</Link></div>
      </div>
      <p className="sub">Rent roll, {monthName} so far, and who owes what — by landlord and by property.</p>

      <div className="stats" style={{ marginTop: 0, marginBottom: 18 }}>
        <div className="stat"><div className="k">Rent roll</div><div className="v">{formatMoney(t.rentRollMonthly)}</div><div className="m">a month, from {t.activeTenancies} active tenanc{t.activeTenancies === 1 ? "y" : "ies"}</div></div>
        <div className="stat"><div className="k">Charged in {monthName.split(" ")[0]}</div><div className="v">{formatMoney(t.monthCharged)}</div><div className="m">service charges due this month</div></div>
        <div className="stat"><div className="k">Collected in {monthName.split(" ")[0]}</div><div className="v" style={{ color: "var(--live)" }}>{formatMoney(t.monthPaid)}</div><div className="m">{collectedPct === null ? "nothing charged yet" : `${collectedPct}% of what was charged`}</div></div>
        <Link href="/ledger" className="stat"><div className="k">Owed</div><div className={`v${t.owed > 0 ? " money" : ""}`}>{formatMoney(t.owed)}</div><div className="m">{t.inArrears === 0 ? "nobody is behind" : `${t.inArrears} tenant${t.inArrears === 1 ? "" : "s"} behind`}</div></Link>
      </div>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="ch"><h3>By landlord</h3><span className="muted">all time</span></div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ textAlign: "left", color: "var(--slate)" }}><th style={th}>Landlord</th><th style={thR}>Properties</th><th style={thR}>Tenants</th><th style={thR}>Rent roll / month</th><th style={thR}>Charged</th><th style={thR}>Collected</th><th style={thR}>Balance</th></tr></thead>
            <tbody>{data.byLandlord.map((r) => { const bal = r.paid - r.charged; return (
              <tr key={r.landlordId ?? "none"} style={{ borderTop: "1px solid var(--line-soft)" }}>
                <td style={td}>{r.landlordId ? <Link href={`/landlords/${r.landlordId}`} style={{ color: "var(--navy)", fontWeight: 600 }}>{r.landlord}</Link> : <span className="muted">{r.landlord}</span>}</td>
                <td style={tdR}>{r.properties}</td><td style={tdR}>{r.tenants}</td><td style={tdR}>{formatMoney(r.monthlyRoll)}</td><td style={tdR}>{formatMoney(r.charged)}</td><td style={{ ...tdR, color: "var(--live)" }}>{formatMoney(r.paid)}</td>
                <td style={{ ...tdR, color: bal < 0 ? "var(--brick)" : "var(--live)", fontWeight: 600 }}>{bal < 0 ? "-" : ""}{formatMoney(Math.abs(bal))}</td>
              </tr>); })}</tbody>
          </table>
        </div>
        {data.byLandlord.length === 0 && <div className="li"><p className="muted">No properties yet.</p></div>}
      </section>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="ch"><h3>By property</h3></div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ textAlign: "left", color: "var(--slate)" }}><th style={th}>Property</th><th style={th}>Landlord</th><th style={thR}>Tenants</th><th style={thR}>Rent roll / month</th><th style={thR}>Charged</th><th style={thR}>Collected</th><th style={thR}>Balance</th></tr></thead>
            <tbody>{data.byProperty.map((p) => (
              <tr key={p.propertyId} style={{ borderTop: "1px solid var(--line-soft)" }}>
                <td style={td}><Link href={`/properties/${p.propertyId}`} style={{ color: "var(--navy)", fontWeight: 600 }}>{p.property}</Link></td><td style={td} className="muted">{p.landlord}</td>
                <td style={tdR}>{p.tenants}</td><td style={tdR}>{formatMoney(p.monthlyRoll)}</td><td style={tdR}>{formatMoney(p.charged)}</td><td style={{ ...tdR, color: "var(--live)" }}>{formatMoney(p.paid)}</td>
                <td style={{ ...tdR, color: p.balance < 0 ? "var(--brick)" : "var(--live)", fontWeight: 600 }}>{p.balance < 0 ? "-" : ""}{formatMoney(Math.abs(p.balance))}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
        <section className="card">
          <div className="ch"><h3>Behind on rent</h3><span className="muted">{data.arrears.length}</span></div>
          {data.arrears.length === 0 ? <div className="li"><p className="muted">Nobody. </p></div> : data.arrears.map((a) => (
            <Link key={a.tenantId} href={`/tenants/${a.tenantId}?tab=ledger`} className="li row"><div className="body"><b>{a.name}</b><p>{a.room ?? "No room"}</p></div><b style={{ color: "var(--brick)" }}>{formatMoney(a.owed)}</b></Link>
          ))}
        </section>
        <section className="card">
          <div className="ch"><h3>Latest payments</h3></div>
          {data.recentPayments.length === 0 ? <div className="li"><p className="muted">None recorded yet.</p></div> : data.recentPayments.map((p) => (
            <Link key={p.id} href={`/tenants/${p.tenant_id}?tab=ledger`} className="li row"><div className="body"><b>{p.full_name}</b><p>{p.payment_type} · {formatShortDate(p.payment_date)}</p></div><b style={{ color: "var(--live)" }}>{formatMoney(p.amount)}</b></Link>
          ))}
        </section>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 14px", fontWeight: 600, whiteSpace: "nowrap" };
const thR: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "10px 14px" };
const tdR: React.CSSProperties = { ...td, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" };
