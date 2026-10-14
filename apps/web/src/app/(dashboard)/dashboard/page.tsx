/**
 * Today — the hero. Opens on only what needs a person, then says everything
 * else is handled. One button per item. Governed by
 * docs/ESTATE_OPS_INTEGRATION_PROMPT.md §4.2.
 *
 * Data: useNeedsYou() (one call, shared with the nav badge). The agent grid
 * appears when the agent runtime lands (docs/BUILD_PLAN.md C14).
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


export default function TodayPage() {
  const { profile } = useAuth();
  const { data, error, loading } = useNeedsYou();

  const [leadCounts, setLeadCounts] = useState<Record<string, number> | null>(null);
  const [journeys, setJourneys] = useState<TenantJourney[] | null>(null);
  useEffect(() => {
    fetch("/api/leads").then((r) => (r.ok ? r.json() : null)).then((j) => j && setLeadCounts(j.counts)).catch(() => {});
    fetch("/api/journey").then((r) => (r.ok ? r.json() : null)).then((j) => j && setJourneys(j.tenants)).catch(() => setJourneys([]));
  }, []);
  const first = profile?.full_name?.split(" ")[0];
  const items = data?.items ?? [];
  const n = items.length;

  return (
    <>
      <h1>{greeting()}{first ? `, ${first}` : ""}.</h1>
      <p className="sub">
        {loading ? "Checking what needs you…"
          : error ? "Couldn't check just now. What you last saw is still below."
          : n === 0 ? "Nothing needs a decision from you. Everything is being handled."
          : `${n === 1 ? "One thing needs" : `${n} things need`} a decision from you. Everything else is handled.`}
      </p>

      <div className="how" aria-label="How this works">
        <div><b><i>1</i>The system watches</b>Housing benefit, service charges, repairs, signatures and handovers.</div>
        <div><b><i>2</i>It lines up the next step</b>Each item below says what happened and what to do.</div>
        <div><b><i>3</i>You press the button</b>Nothing is sent or changed without you.</div>
      </div>

      <section className="needs" aria-live="polite">
        <div className="hd"><h2>Needs you today</h2><span>The system proposes, you decide</span></div>
        {error && !data ? (
          <div className="decision due">
            <div className="ic" aria-hidden="true">!</div>
            <div><p className="t">Couldn&apos;t load the list</p><p className="d">{error.message}. Try again in a moment; nothing was lost.</p></div>
            <Link className="act ghost" href="/tenants">Tenants</Link>
          </div>
        ) : n === 0 && !loading ? (
          <div className="decision">
            <div className="ic" aria-hidden="true">✓</div>
            <div><p className="t">You&apos;re clear.</p><p className="d">Come back tomorrow, or look at Tenants while you wait.</p></div>
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
      </section>

      <div className="stats">
        <Link href="/tenants" className="stat"><div className="k">Tenants housed</div><div className="v">{data ? data.stats.peopleHoused : "—"}</div><div className="m">active tenants</div></Link>
        <Link href="/ledger" className="stat"><div className="k">Money owed</div><div className={`v${data && data.stats.moneyOwed > 0 ? " money" : ""}`}>{data ? formatMoney(data.stats.moneyOwed) : "—"}</div><div className="m">{data ? (data.stats.moneyOwed > 0 ? "service charge past its due date" : "nobody is behind") : " "}</div></Link>
        <Link href="/tenants?filter=suspended" className="stat"><div className="k">Housing benefit</div><div className="v">{data ? data.stats.housingBenefitAtRisk : "—"}</div><div className="m">{data ? (data.stats.housingBenefitAtRisk === 0 ? "all claims paying" : "pending or suspended") : " "}</div></Link>
        <Link href="/maintenance" className="stat"><div className="k">Repairs</div><div className="v">{data ? data.stats.repairsOpen : "—"}</div><div className="m">{data ? (data.stats.repairsOpen === 0 ? "nothing open" : "open right now") : " "}</div></Link>
      </div>

      {/* The tenant journey (Matloob, 2026-10-14): "when we click dashboard we see where we are — lead received, referenced…" */}
      <section className="card" style={{ marginTop: 18 }}>
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

      <section className="card" style={{ marginTop: 18 }}>
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

      <p className="muted" style={{ margin: "10px 0 0" }}><Link href="/reports/morning-summary" style={{ color: "var(--amber-deep)", fontWeight: 600 }}>This morning&apos;s summary</Link> · <Link href="/reports" style={{ color: "var(--amber-deep)", fontWeight: 600 }}>Monthly report</Link> · <Link href="/settings" style={{ color: "var(--amber-deep)", fontWeight: 600 }}>Settings</Link></p>

      {data && (
        <div className="clear">
          <div className="tick" aria-hidden="true">✓</div>
          <div>
            <b>{n === 0 ? "Everything is handled." : "Everything else is handled."}</b>
            <span>Checked {new Date(data.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}: {data.checked.join(", ")}.</span>
          </div>
        </div>
      )}
    </>
  );
}
