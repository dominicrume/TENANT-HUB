/**
 * Dashboard — Matlub's three sections in the order he asked for them
 * (walkthrough 2026-10-24): 1 Analytics (one picture of occupancy +
 * compliance), 2 Tasks (what needs you today), 3 Signup timeline (the eight
 * stations). Keep the headline stats and the greeting; everything else is
 * reorder, not reinvention.
 */
"use client";

import Link from "next/link";
import { useAuth } from "../../../contexts/AuthContext";
import { useNeedsYou } from "../../../hooks/useNeedsYou";
import { GROUP, GROUP_ORDER, GROUP_ICON } from "@tenant-hub/domain";
import { formatMoney, greeting } from "../../../lib/format";
import { useEffect, useState } from "react";
import { LEAD_STAGES } from "../../../lib/leads";
import { JourneyDots } from "../../../components/JourneyDots";
import type { TenantJourney } from "../../../lib/journey-server";

interface Analytics {
  occupancy: { rooms: number; filled: number; empty: number; pct: number; byProperty: Array<{ id: string; name: string; filled: number; total: number }> };
  compliance: { required: number; held: number; missing: number; expiringIn30: number; issues: Array<{ propertyId: string; propertyName: string; certName: string; status: "missing" | "expired" | "expiring"; expiresOn: string | null }> };
}

export default function TodayPage() {
  const { profile } = useAuth();
  const { data, error, loading } = useNeedsYou();

  const [leadCounts, setLeadCounts] = useState<Record<string, number> | null>(null);
  const [journeys, setJourneys] = useState<TenantJourney[] | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState<"occ" | "comp" | null>(null);

  useEffect(() => {
    fetch("/api/leads").then((r) => (r.ok ? r.json() : null)).then((j) => j && setLeadCounts(j.counts)).catch(() => {});
    fetch("/api/journey").then((r) => (r.ok ? r.json() : null)).then((j) => j && setJourneys(j.tenants)).catch(() => setJourneys([]));
    fetch("/api/dashboard-analytics").then((r) => (r.ok ? r.json() : null)).then((j) => j && setAnalytics(j)).catch(() => {});
  }, []);
  const first = profile?.full_name?.split(" ")[0];
  const items = data?.items ?? [];
  const n = items.length;
  const dueNow = (journeys ?? []).filter((t) => t.next);
  const totalTasks = n + dueNow.length;

  return (
    <>
      <h1>{greeting()}{first ? `, ${first}` : ""}.</h1>
      <p className="sub">
        {loading && !analytics ? "Pulling up today's picture…"
          : totalTasks === 0 ? "Nothing needs a decision from you. Everything is being handled."
          : `${totalTasks === 1 ? "One thing needs" : `${totalTasks} things need`} a decision from you.`}
      </p>

      {/* ── 1. ANALYTICS ─────────────────────────────────────────── */}
      <section className="dash-sec" aria-label="Analytics">
        <div className="sec-hd"><span className="sec-n">1</span><h2>Analytics</h2><span className="muted" style={{ fontSize: 12.5 }}>How the business is doing, in one picture</span></div>
        <div className="an-grid">
          <OccupancyCard a={analytics} open={analyticsOpen === "occ"} onToggle={() => setAnalyticsOpen((v) => v === "occ" ? null : "occ")} />
          <ComplianceCard a={analytics} open={analyticsOpen === "comp"} onToggle={() => setAnalyticsOpen((v) => v === "comp" ? null : "comp")} />
        </div>
        <div className="stats" style={{ marginTop: 14 }}>
          <Link href="/tenants" className="stat"><div className="k">Tenants housed</div><div className="v">{data ? data.stats.peopleHoused : "—"}</div><div className="m">active tenants</div></Link>
          <Link href="/ledger" className="stat"><div className="k">Money owed</div><div className={`v${data && data.stats.moneyOwed > 0 ? " money" : ""}`}>{data ? formatMoney(data.stats.moneyOwed) : "—"}</div><div className="m">{data ? (data.stats.moneyOwed > 0 ? "service charge past its due date" : "nobody is behind") : " "}</div></Link>
          <Link href="/tenants?filter=suspended" className="stat"><div className="k">Housing benefit</div><div className="v">{data ? data.stats.housingBenefitAtRisk : "—"}</div><div className="m">{data ? (data.stats.housingBenefitAtRisk === 0 ? "all claims paying" : "pending or suspended") : " "}</div></Link>
          <Link href="/maintenance" className="stat"><div className="k">Repairs</div><div className="v">{data ? data.stats.repairsOpen : "—"}</div><div className="m">{data ? (data.stats.repairsOpen === 0 ? "nothing open" : "open right now") : " "}</div></Link>
        </div>
      </section>

      {/* ── 2. TASKS ─────────────────────────────────────────────── */}
      <section className="dash-sec" aria-live="polite" aria-label="Tasks">
        <div className="sec-hd"><span className="sec-n">2</span><h2>Tasks</h2><span className="muted" style={{ fontSize: 12.5 }}>What needs you today</span></div>

        <div className="how" aria-label="How this works">
          <div><b><i>1</i>The system watches</b>Housing benefit, service charges, repairs, signatures and handovers.</div>
          <div><b><i>2</i>It lines up the next step</b>Each item below says what happened and what to do.</div>
          <div><b><i>3</i>You press the button</b>Nothing is sent or changed without you.</div>
        </div>

        <div className="needs" style={{ marginTop: 0 }}>
          <div className="hd"><h3 style={{ margin: 0, fontSize: 15 }}>Needs you</h3><span>The system proposes, you decide</span></div>
          {error && !data ? (
            <div className="decision due">
              <div className="ic" aria-hidden="true">!</div>
              <div><p className="t">Couldn&apos;t load the list</p><p className="d">{error.message}. Try again in a moment; nothing was lost.</p></div>
              <Link className="act ghost" href="/tenants">Tenants</Link>
            </div>
          ) : n === 0 && !loading ? (
            <div className="decision">
              <div className="ic" aria-hidden="true">✓</div>
              <div><p className="t">You&apos;re clear on this list.</p><p className="d">Check the tenant stations below for anything waiting on a form.</p></div>
              <Link className="act ghost" href="/tenants">Tenants</Link>
            </div>
          ) : (
            <div className="decisions">
              {GROUP_ORDER.filter((g) => items.some((d) => d.kind === g)).map((g) => (
                <div className="group" key={g}>
                  <p className="gh">{GROUP[g]} <span>{items.filter((d) => d.kind === g).length}</span></p>
                  {items.filter((d) => d.kind === g).map((d, i) => (
                    <div className={`decision ${d.tone}`} key={`${g}-${i}`}>
                      <div className="ic" aria-hidden="true">{GROUP_ICON[d.kind]}</div>
                      <div><p className="t">{d.title}</p><p className="d">{d.detail}</p></div>
                      <Link className="act" href={d.href}>{d.cta}</Link>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {journeys && dueNow.length > 0 && (
          <div className="card" style={{ marginTop: 14, borderColor: "var(--amber)" }}>
            <div className="ch"><h3>Per-tenant · {dueNow.length} waiting on a station</h3><span className="muted" style={{ fontSize: 12 }}>The next step on their journey</span></div>
            {dueNow.map((t) => (
              <Link key={t.tenantId} href={`/tenants/${t.tenantId}${t.next!.key === "signed_up" ? "/signup" : t.next!.key === "claim_done" || t.next!.key === "email_sent" ? "?tab=signup" : ""}`} className="li row" style={{ alignItems: "center" }}>
                <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--brick)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13, flex: "none" }}>{t.next!.n}</span>
                <div className="body"><b>{t.next!.label} · {t.name}</b><p>{t.next!.what}</p></div>
                <span className="act">Do it</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── 3. SIGNUP TIMELINE ───────────────────────────────────── */}
      <section className="dash-sec" aria-label="Signup timeline">
        <div className="sec-hd"><span className="sec-n">3</span><h2>Signup timeline</h2><span className="muted" style={{ fontSize: 12.5 }}>Every tenant · lead → viewing → signed → moved in → claim → email → portal → moved out</span></div>

        <section className="card">
          <div className="ch"><h3>Where every tenant is</h3><span className="muted" style={{ fontSize: 12 }}>1 lead · 2 viewing · 3 signed · 4 moved in · 5 claim · 6 email · 7 portal · 8 moved out</span></div>
          {journeys === null ? <div className="li"><p className="muted">Checking the stations…</p></div>
            : journeys.length === 0 ? <div className="li"><div className="body"><b>No tenants yet</b><p>The first one you add gets their eight stations here.</p></div></div>
            : journeys.map((t) => (
              <Link key={t.tenantId} href={`/tenants/${t.tenantId}`} className="li row" style={{ alignItems: "center" }}>
                <div className="body" style={{ flex: "0 1 260px" }}><b>{t.name}</b><p>{[t.room, t.landlord].filter(Boolean).join(" · ") || "No room yet"}</p></div>
                <JourneyDots stations={t.stations} size={18} />
                <span className="muted" style={{ marginLeft: "auto", fontSize: 12.5, whiteSpace: "nowrap" }}>{t.next ? <>Next: <b style={{ color: "var(--brick)" }}>{t.next.label}</b></> : <span style={{ color: "var(--live)", fontWeight: 600 }}>All done</span>}</span>
              </Link>
            ))}
        </section>

        <section className="card" style={{ marginTop: 14 }}>
          <div className="ch"><h3>Before they&apos;re tenants</h3><Link href="/leads" className="btn ghost sm">Open leads</Link></div>
          <div className="timeline" style={{ margin: 0, padding: "14px 16px" }}>
            {LEAD_STAGES.map((s, i) => (
              <Link key={s.key} href={`/leads#stage-${s.key}`} className="tl-step">
                <span className="tl-n">{leadCounts ? (s.key === "moved_in" ? (data?.stats.peopleHoused ?? leadCounts[s.key] ?? 0) : (leadCounts[s.key] ?? 0)) : "—"}</span>
                <b>{s.label}</b>
                <small>{s.hint}</small>
                {i < LEAD_STAGES.length - 1 && <span className="tl-arrow" aria-hidden="true">›</span>}
              </Link>
            ))}
          </div>
        </section>
      </section>

      <p className="muted" style={{ margin: "16px 0 0" }}><Link href="/reports/morning-summary" style={{ color: "var(--amber-deep)", fontWeight: 600 }}>This morning&apos;s summary</Link> · <Link href="/reports" style={{ color: "var(--amber-deep)", fontWeight: 600 }}>Monthly report</Link> · <Link href="/settings" style={{ color: "var(--amber-deep)", fontWeight: 600 }}>Settings</Link></p>

      {data && (
        <div className="clear">
          <div className="tick" aria-hidden="true">✓</div>
          <div>
            <b>{totalTasks === 0 ? "Everything is handled." : "Everything else is handled."}</b>
            <span>Checked {new Date(data.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}: {data.checked.join(", ")}.</span>
          </div>
        </div>
      )}
    </>
  );
}

function OccupancyCard({ a, open, onToggle }: { a: Analytics | null; open: boolean; onToggle: () => void }) {
  const o = a?.occupancy;
  const pct = o?.pct ?? 0;
  return (
    <article className="an-card">
      <div className="an-head"><b>Occupancy</b><span className="muted" style={{ fontSize: 12 }}>right now, across every room</span></div>
      <div className="an-body">
        <OccupancyPie filled={o?.filled ?? 0} empty={o?.empty ?? 0} />
        <div className="an-figures">
          <div className="big">{a === null ? "—" : `${pct}%`}<span className="unit">occupied</span></div>
          <div className="legend">
            <span><i className="d filled" /> {o?.filled ?? "—"} filled</span>
            <span><i className="d empty" /> {o?.empty ?? "—"} void</span>
            <span className="muted">{o?.rooms ?? "—"} rooms in total</span>
          </div>
          <button type="button" className="btn ghost sm" onClick={onToggle} aria-expanded={open}>{open ? "Hide breakdown" : "See voids per property"}</button>
        </div>
      </div>
      {open && (
        <div className="an-break">
          {!o || o.byProperty.length === 0 ? <p className="muted" style={{ margin: 0, fontSize: 13 }}>No properties yet.</p> : (
            <ul className="prop-list">
              {o.byProperty.map((p) => {
                const vd = p.total - p.filled; const pp = p.total ? Math.round((p.filled / p.total) * 100) : 0;
                return (
                  <li key={p.id}>
                    <Link href={`/properties/${p.id}`}>
                      <span className="pname">{p.name}</span>
                      <span className="pbar"><i style={{ width: `${pp}%`, background: vd === 0 ? "linear-gradient(90deg, var(--live), #1E7F4F)" : "linear-gradient(90deg, var(--amber), var(--amber-deep))" }} /></span>
                      <span className="pnums">{p.filled}/{p.total}</span>
                      <span className={`pfree ${vd === 0 ? "live" : vd > 0 ? "amber" : ""}`}>{p.total === 0 ? "no rooms" : vd === 0 ? "full" : `${vd} free`}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

function ComplianceCard({ a, open, onToggle }: { a: Analytics | null; open: boolean; onToggle: () => void }) {
  const c = a?.compliance;
  const bad = (c?.missing ?? 0) + (c?.expiringIn30 ?? 0);
  const tone = (c?.missing ?? 0) > 0 ? "attn" : (c?.expiringIn30 ?? 0) > 0 ? "warn" : "ok";
  return (
    <article className="an-card">
      <div className="an-head"><b>Compliance</b><span className="muted" style={{ fontSize: 12 }}>certificates on file against what each property needs</span></div>
      <div className="an-body">
        <ComplianceDonut held={c?.held ?? 0} missing={c?.missing ?? 0} expiring={c?.expiringIn30 ?? 0} />
        <div className="an-figures">
          <div className={`big t-${tone}`}>{a === null ? "—" : bad === 0 ? "All in" : bad}<span className="unit">{bad === 0 ? "" : bad === 1 ? "to sort" : "to sort"}</span></div>
          <div className="legend">
            <span><i className="d missing" /> {c?.missing ?? "—"} missing or out of date</span>
            <span><i className="d expiring" /> {c?.expiringIn30 ?? "—"} expiring in 30 days</span>
            <span><i className="d held" /> {c?.held ?? "—"} valid</span>
          </div>
          <button type="button" className="btn ghost sm" onClick={onToggle} aria-expanded={open}>{open ? "Hide list" : "See what's missing"}</button>
        </div>
      </div>
      {open && (
        <div className="an-break">
          {!c || c.issues.length === 0 ? <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nothing missing. Every property&apos;s paperwork is on file.</p> : (
            <ul className="iss-list">
              {c.issues.map((i, idx) => (
                <li key={idx}>
                  <Link href={`/properties/${i.propertyId}`}>
                    <span className={`idot ${i.status}`} />
                    <span className="pname">{i.propertyName}</span>
                    <span className="iname">{i.certName}</span>
                    <span className={`istat ${i.status}`}>{i.status === "missing" ? "none on file" : i.status === "expired" ? "expired" : `expires ${new Date(i.expiresOn!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

function OccupancyPie({ filled, empty }: { filled: number; empty: number }) {
  const total = filled + empty;
  const pct = total ? filled / total : 0;
  const r = 44; const c = 2 * Math.PI * r;
  const dash = pct * c;
  const label = total ? `${filled} of ${total} rooms occupied` : "no rooms yet";
  return (
    <svg width={120} height={120} viewBox="0 0 120 120" role="img" aria-label={label}>
      <circle cx={60} cy={60} r={r} fill="none" stroke="var(--line)" strokeWidth={14} />
      <circle cx={60} cy={60} r={r} fill="none" stroke={pct === 1 ? "var(--live)" : "var(--amber)"} strokeWidth={14} strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`} transform="rotate(-90 60 60)"
              style={{ transition: "stroke-dasharray 800ms cubic-bezier(.4,0,.2,1)" }} />
      <text x="60" y="56" textAnchor="middle" fontSize="22" fontWeight={700} fill="var(--navy)">{total ? `${Math.round(pct * 100)}%` : "—"}</text>
      <text x="60" y="74" textAnchor="middle" fontSize="10" fill="var(--slate)">occupied</text>
    </svg>
  );
}

function ComplianceDonut({ held, missing, expiring }: { held: number; missing: number; expiring: number }) {
  const total = held + missing + expiring;
  const r = 44; const c = 2 * Math.PI * r;
  const held2 = total ? (held / total) * c : 0;
  const exp2 = total ? (expiring / total) * c : 0;
  const miss2 = total ? (missing / total) * c : 0;
  return (
    <svg width={120} height={120} viewBox="0 0 120 120" role="img" aria-label={`${held} valid, ${missing} missing, ${expiring} expiring soon`}>
      <circle cx={60} cy={60} r={r} fill="none" stroke="var(--line)" strokeWidth={14} />
      {total > 0 && (
        <g transform="rotate(-90 60 60)">
          <circle cx={60} cy={60} r={r} fill="none" stroke="var(--live)" strokeWidth={14}
                  strokeDasharray={`${held2} ${c}`} style={{ transition: "stroke-dasharray 800ms" }} />
          <circle cx={60} cy={60} r={r} fill="none" stroke="var(--amber)" strokeWidth={14}
                  strokeDasharray={`${exp2} ${c - exp2}`} strokeDashoffset={-held2} style={{ transition: "stroke-dasharray 800ms, stroke-dashoffset 800ms" }} />
          <circle cx={60} cy={60} r={r} fill="none" stroke="var(--brick)" strokeWidth={14}
                  strokeDasharray={`${miss2} ${c - miss2}`} strokeDashoffset={-(held2 + exp2)} style={{ transition: "stroke-dasharray 800ms, stroke-dashoffset 800ms" }} />
        </g>
      )}
      <text x="60" y="56" textAnchor="middle" fontSize="22" fontWeight={700} fill={missing > 0 ? "var(--brick)" : expiring > 0 ? "var(--amber-deep)" : "var(--live)"}>{total ? `${held}/${total}` : "—"}</text>
      <text x="60" y="74" textAnchor="middle" fontSize="10" fill="var(--slate)">valid</text>
    </svg>
  );
}
