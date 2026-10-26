/**
 * Financials — the money the way a managing agent reads it (Matloob,
 * 2026-10-14) + the robustness an accountant expects (Rume, 2026-10-25):
 * rent roll, this month in and out with trend chips vs last month,
 * aged receivables (0-30 / 31-60 / 61-90 / 90+), 6-month collected trend,
 * by landlord + by property with a Statement link per row, and a CSV
 * export that drops every row of every table into a single file the
 * accountant can open in Excel. The ledger (every charge and payment) is
 * one click away.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatMoney, formatShortDate } from "../../../lib/format";

interface Fin {
  monthStart: string;
  totals: {
    rentRollMonthly: number; activeTenancies: number;
    monthCharged: number; monthPaid: number;
    owed: number; inArrears: number;
    allTimeCharged: number; allTimePaid: number;
    prevMonthCharged: number; prevMonthPaid: number;
    collectionRatePct: number | null;
  };
  agedReceivables: Record<"0-30" | "31-60" | "61-90" | "90+", { amount: number; count: number }>;
  trend: Array<{ month: string; charged: number; paid: number }>;
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

  const monthName = useMemo(() => data ? new Date(data.monthStart + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "", [data]);

  if (error) return <div style={{ padding: "1.75rem" }}><p style={{ color: "var(--brick)" }}>{error}</p></div>;
  if (!data) return <div style={{ padding: "1.75rem" }}><p className="muted">Adding it up…</p></div>;

  const d = data; // narrow for closures below
  const { totals: t } = d;
  const empty = t.activeTenancies === 0 && d.byProperty.length === 0;

  function exportCsv() {
    const rows: string[][] = [];
    rows.push(["Section", "Field", "Value"]);
    rows.push(["totals", "Period", monthName]);
    rows.push(["totals", "Rent roll per month", String(t.rentRollMonthly)]);
    rows.push(["totals", "Active tenancies", String(t.activeTenancies)]);
    rows.push(["totals", "Charged this month", String(t.monthCharged)]);
    rows.push(["totals", "Collected this month", String(t.monthPaid)]);
    rows.push(["totals", "Collection rate %", t.collectionRatePct === null ? "" : String(t.collectionRatePct)]);
    rows.push(["totals", "Owed", String(t.owed)]);
    rows.push(["totals", "Tenants in arrears", String(t.inArrears)]);
    rows.push([]);
    rows.push(["aged", "Bucket", "Amount", "Charges"]);
    (["0-30", "31-60", "61-90", "90+"] as const).forEach((b) => rows.push(["aged", b, String(d.agedReceivables[b].amount), String(d.agedReceivables[b].count)]));
    rows.push([]);
    rows.push(["trend", "Month", "Charged", "Collected"]);
    d.trend.forEach((r) => rows.push(["trend", r.month, String(r.charged), String(r.paid)]));
    rows.push([]);
    rows.push(["by_landlord", "Landlord", "Properties", "Tenants", "Rent roll / month", "Charged (all time)", "Collected (all time)", "Balance"]);
    d.byLandlord.forEach((r) => rows.push(["by_landlord", r.landlord, String(r.properties), String(r.tenants), String(r.monthlyRoll), String(r.charged), String(r.paid), String(r.paid - r.charged)]));
    rows.push([]);
    rows.push(["by_property", "Property", "Landlord", "Tenants", "Rent roll / month", "Charged (all time)", "Collected (all time)", "Balance"]);
    d.byProperty.forEach((p) => rows.push(["by_property", p.property, p.landlord, String(p.tenants), String(p.monthlyRoll), String(p.charged), String(p.paid), String(p.balance)]));
    rows.push([]);
    rows.push(["arrears", "Tenant", "Room", "Owed"]);
    d.arrears.forEach((a) => rows.push(["arrears", a.name, a.room ?? "", String(a.owed)]));
    rows.push([]);
    rows.push(["payments", "Date", "Tenant", "Type", "Amount"]);
    d.recentPayments.forEach((p) => rows.push(["payments", p.payment_date, p.full_name, p.payment_type, String(p.amount)]));
    const csv = rows.map((r) => r.map((c) => /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `financials-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: "1.75rem", maxWidth: 1100 }}>
      <div className="ch" style={{ padding: 0, marginBottom: 6, border: "none", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ margin: 0 }}>Financials</h1>
        <div className="btns">
          <button type="button" className="btn ghost sm" onClick={exportCsv} disabled={empty} title={empty ? "Nothing to export yet" : "Download every table as CSV"}>↓ Export CSV</button>
          <Link href="/ledger" className="btn ghost sm">Open the ledger</Link>
          <Link href="/ledger" className="rel sm">Record a payment</Link>
        </div>
      </div>
      <p className="sub">Rent roll, {monthName} so far, and who owes what — by landlord and by property. Export the lot for your accountant any time.</p>

      {empty && (
        <section className="card" style={{ marginBottom: 18 }}>
          <div className="li"><div className="body">
            <b>Nothing to charge yet.</b>
            <p>Finances show up here as soon as there&apos;s an active tenancy on a room. Add a landlord → add a property → add a room → put a tenant in it, and the first rent roll + charge figures appear here on the next page load.</p>
          </div></div>
        </section>
      )}

      <div className="stats" style={{ marginTop: 0, marginBottom: 14 }}>
        <KPI k="Rent roll" v={formatMoney(t.rentRollMonthly)} m={`a month, from ${t.activeTenancies} active tenanc${t.activeTenancies === 1 ? "y" : "ies"}`} />
        <KPI k={`Charged in ${monthName.split(" ")[0]}`} v={formatMoney(t.monthCharged)} m={"service charges due this month"} delta={pct(t.monthCharged, t.prevMonthCharged)} />
        <KPI k={`Collected in ${monthName.split(" ")[0]}`} v={formatMoney(t.monthPaid)} tone="live" m={t.collectionRatePct === null ? "nothing charged yet" : `${t.collectionRatePct}% of what was charged`} delta={pct(t.monthPaid, t.prevMonthPaid)} />
        <Link href="/ledger" className="stat"><div className="k">Owed</div><div className={`v${t.owed > 0 ? " money" : ""}`}>{formatMoney(t.owed)}</div><div className="m">{t.inArrears === 0 ? "nobody is behind" : `${t.inArrears} tenant${t.inArrears === 1 ? "" : "s"} behind`}</div></Link>
      </div>

      {/* Aged receivables — the view an accountant opens the page expecting. */}
      <section className="card fin-aged" style={{ marginBottom: 14 }}>
        <div className="ch"><h3>Aged receivables</h3><span className="muted" style={{ fontSize: 12 }}>unpaid charges, by how long they&apos;ve been owed</span></div>
        <div className="aged-grid">
          {(["0-30", "31-60", "61-90", "90+"] as const).map((b) => {
            const row = d.agedReceivables[b];
            const tone = b === "0-30" ? "ok" : b === "31-60" ? "warn" : "attn";
            return (
              <div key={b} className={`aged-cell ${tone}`}>
                <small>{b} days</small>
                <b>{formatMoney(row.amount)}</b>
                <span>{row.count === 0 ? "nothing in this bucket" : `${row.count} charge${row.count === 1 ? "" : "s"}`}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Six-month collected trend — inline SVG, same amber / live-green vocabulary as everywhere else. */}
      <section className="card" style={{ marginBottom: 14 }}>
        <div className="ch"><h3>Last six months</h3><span className="muted" style={{ fontSize: 12 }}>charged bars, collected line</span></div>
        <div style={{ padding: 14 }}>
          <TrendChart points={d.trend} />
        </div>
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <div className="ch"><h3>By landlord</h3><span className="muted">all time</span></div>
        {d.byLandlord.length === 0 ? (
          <div className="li"><p className="muted">No landlord figures yet — add a landlord and give them properties.</p></div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="fin-tbl">
              <thead><tr><th style={th}>Landlord</th><th style={thR}>Properties</th><th style={thR}>Tenants</th><th style={thR}>Rent roll / month</th><th style={thR}>Charged</th><th style={thR}>Collected</th><th style={thR}>Balance</th><th style={th}></th></tr></thead>
              <tbody>{d.byLandlord.map((r) => { const bal = r.paid - r.charged; return (
                <tr key={r.landlordId ?? "none"}>
                  <td style={td}>{r.landlordId ? <Link href={`/landlords/${r.landlordId}`} style={{ color: "var(--navy)", fontWeight: 600 }}>{r.landlord}</Link> : <span className="muted">{r.landlord}</span>}</td>
                  <td style={tdR}>{r.properties}</td><td style={tdR}>{r.tenants}</td><td style={tdR}>{formatMoney(r.monthlyRoll)}</td><td style={tdR}>{formatMoney(r.charged)}</td><td style={{ ...tdR, color: "var(--live)" }}>{formatMoney(r.paid)}</td>
                  <td style={{ ...tdR, color: bal < 0 ? "var(--brick)" : "var(--live)", fontWeight: 600 }}>{bal < 0 ? "-" : ""}{formatMoney(Math.abs(bal))}</td>
                  <td style={{ ...td, textAlign: "right" }}>{r.landlordId ? <Link href={`/landlords/${r.landlordId}`} className="btn ghost sm" style={{ padding: "4px 10px", minHeight: 28 }}>Statement</Link> : null}</td>
                </tr>); })}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <div className="ch"><h3>By property</h3><span className="muted">all time</span></div>
        {d.byProperty.length === 0 ? (
          <div className="li"><p className="muted">No properties yet.</p></div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="fin-tbl">
              <thead><tr><th style={th}>Property</th><th style={th}>Landlord</th><th style={thR}>Tenants</th><th style={thR}>Rent roll / month</th><th style={thR}>Charged</th><th style={thR}>Collected</th><th style={thR}>Balance</th><th style={th}></th></tr></thead>
              <tbody>{d.byProperty.map((p) => (
                <tr key={p.propertyId}>
                  <td style={td}><Link href={`/properties/${p.propertyId}`} style={{ color: "var(--navy)", fontWeight: 600 }}>{p.property}</Link></td><td style={td} className="muted">{p.landlord}</td>
                  <td style={tdR}>{p.tenants}</td><td style={tdR}>{formatMoney(p.monthlyRoll)}</td><td style={tdR}>{formatMoney(p.charged)}</td><td style={{ ...tdR, color: "var(--live)" }}>{formatMoney(p.paid)}</td>
                  <td style={{ ...tdR, color: p.balance < 0 ? "var(--brick)" : "var(--live)", fontWeight: 600 }}>{p.balance < 0 ? "-" : ""}{formatMoney(Math.abs(p.balance))}</td>
                  <td style={{ ...td, textAlign: "right" }}><Link href={`/properties/${p.propertyId}`} className="btn ghost sm" style={{ padding: "4px 10px", minHeight: 28 }}>Statement</Link></td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        <section className="card">
          <div className="ch"><h3>Behind on rent</h3><span className={d.arrears.length === 0 ? "muted" : ""} style={{ color: d.arrears.length > 0 ? "var(--brick)" : undefined }}>{d.arrears.length}</span></div>
          {d.arrears.length === 0 ? <div className="li"><p className="muted">Nobody. All tenancies are square with the ledger.</p></div> : d.arrears.map((a) => (
            <Link key={a.tenantId} href={`/tenants/${a.tenantId}?tab=ledger`} className="li row"><div className="body"><b>{a.name}</b><p>{a.room ?? "No room"}</p></div><b style={{ color: "var(--brick)" }}>{formatMoney(a.owed)}</b></Link>
          ))}
        </section>
        <section className="card">
          <div className="ch"><h3>Latest payments</h3><span className="muted">{d.recentPayments.length === 0 ? "none" : d.recentPayments.length}</span></div>
          {d.recentPayments.length === 0 ? <div className="li"><p className="muted">Record one — + Record a payment above — and it lands here with the tenant and the date.</p></div> : d.recentPayments.map((p) => (
            <Link key={p.id} href={`/tenants/${p.tenant_id}?tab=ledger`} className="li row"><div className="body"><b>{p.full_name}</b><p>{p.payment_type} · {formatShortDate(p.payment_date)}</p></div><b style={{ color: "var(--live)" }}>{formatMoney(p.amount)}</b></Link>
          ))}
        </section>
      </div>
    </div>
  );
}

function pct(now: number, prev: number): { pct: number; dir: "up" | "down" | "flat" } | null {
  if (prev === 0) return now > 0 ? { pct: 100, dir: "up" } : null;
  const delta = (now - prev) / prev;
  if (Math.abs(delta) < 0.01) return { pct: 0, dir: "flat" };
  return { pct: Math.round(Math.abs(delta) * 100), dir: delta > 0 ? "up" : "down" };
}

function KPI({ k, v, m, tone, delta }: { k: string; v: string; m: string; tone?: "live"; delta?: { pct: number; dir: "up" | "down" | "flat" } | null }) {
  return (
    <div className="stat">
      <div className="k" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {k}
        {delta && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: delta.dir === "up" ? "rgba(46,158,107,.12)" : delta.dir === "down" ? "rgba(178,74,49,.12)" : "rgba(92,102,115,.1)", color: delta.dir === "up" ? "var(--live)" : delta.dir === "down" ? "var(--brick)" : "var(--slate)" }}>{delta.dir === "up" ? "↑" : delta.dir === "down" ? "↓" : "="}{delta.pct}% vs last</span>}
      </div>
      <div className="v" style={{ color: tone === "live" ? "var(--live)" : undefined }}>{v}</div>
      <div className="m">{m}</div>
    </div>
  );
}

function TrendChart({ points }: { points: Array<{ month: string; charged: number; paid: number }> }) {
  const W = 700, H = 160, PAD = { top: 10, right: 10, bottom: 24, left: 44 };
  const iw = W - PAD.left - PAD.right, ih = H - PAD.top - PAD.bottom;
  const max = Math.max(1, ...points.map((p) => Math.max(p.charged, p.paid)));
  const bw = iw / Math.max(1, points.length) * 0.6;
  const step = iw / Math.max(1, points.length);
  const x = (i: number) => PAD.left + step * (i + 0.5);
  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.paid)}`).join(" ");
  const yTicks = [0, max / 2, max];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ overflow: "visible" }}>
      {yTicks.map((v, i) => (<g key={i}>
        <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="2 3" />
        <text x={PAD.left - 6} y={y(v) + 4} fontSize="10" fill="var(--slate-2)" textAnchor="end" fontFamily="var(--font-jetbrains-mono), monospace">£{Math.round(v).toLocaleString("en-GB")}</text>
      </g>))}
      {points.map((p, i) => (
        <g key={i}>
          <rect x={x(i) - bw / 2} y={y(p.charged)} width={bw} height={Math.max(0, PAD.top + ih - y(p.charged))} fill="var(--amber)" rx={3} opacity={0.9} />
          <text x={x(i)} y={H - 8} fontSize="10.5" fill="var(--slate)" textAnchor="middle">{new Date(p.month + "-01").toLocaleDateString("en-GB", { month: "short" })}</text>
        </g>
      ))}
      <path d={linePath} fill="none" stroke="var(--live)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => <circle key={`c${i}`} cx={x(i)} cy={y(p.paid)} r={3} fill="var(--live)" />)}
      <g transform={`translate(${W - PAD.right - 160},${PAD.top})`}>
        <rect x={0} y={0} width={10} height={10} fill="var(--amber)" rx={2} /><text x={16} y={9} fontSize="11" fill="var(--slate)">Charged</text>
        <rect x={80} y={4} width={10} height={2} fill="var(--live)" /><circle cx={85} cy={5} r={3} fill="var(--live)" /><text x={100} y={9} fontSize="11" fill="var(--slate)">Collected</text>
      </g>
    </svg>
  );
}

const th: React.CSSProperties = { padding: "10px 14px", fontWeight: 600, whiteSpace: "nowrap", textAlign: "left", color: "var(--slate)" };
const thR: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "10px 14px" };
const tdR: React.CSSProperties = { ...td, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" };
