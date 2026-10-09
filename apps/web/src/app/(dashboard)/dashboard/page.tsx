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
import { useEffect, useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { useNeedsYou } from "../../../hooks/useNeedsYou";
import { GROUP, GROUP_ORDER, GROUP_ICON } from "@tenant-hub/domain";
import { formatMoney, greeting } from "../../../lib/format";
import { downloadCsv } from "../../../lib/csv";

const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 600, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "7px 8px", verticalAlign: "top" };

export default function TodayPage() {
  const { profile } = useAuth();
  const { data, error, loading } = useNeedsYou();

  // What the system did for you — counted from the audit trail (every write
  // is in it, H1), with the time estimate per kind of action shown openly.
  // It's an estimate; the counts are real.
  interface BreakdownRow { agent: string | null; what: string; table: string; action: string; count: number; minutesEach: number; why: string }
  interface ImpactLine { key: string; label: string; count: number; minutes: number; method: string; breakdown: BreakdownRow[]; evidence: { href: string; label: string } }
  interface Impact { days: number; since: string; lines: ImpactLine[]; totalMinutes: number; method: string }
  const [impact, setImpact] = useState<Impact | null>(null);
  const [openLine, setOpenLine] = useState<string | null>(null);
  const [showMethod, setShowMethod] = useState(false);

  // For an assessor: the whole working as a spreadsheet — agent, what it
  // did, count, minutes assumed and why, and where the evidence is.
  function exportImpact() {
    if (!impact) return;
    const rows: (string | number)[][] = [["Line", "Agent", "What it did", "Audit table", "Action", "Count (real)", "Minutes each (assumed)", "Why that many minutes", "Minutes total", "Evidence"]];
    for (const l of impact.lines) for (const b of l.breakdown) rows.push([l.label, b.agent ?? "", b.what, b.table, b.action, b.count, b.minutesEach, b.why, b.count * b.minutesEach, `${window.location.origin}${l.evidence.href}`]);
    rows.push([], ["Total", "", "", "", "", impact.lines.reduce((s, l) => s + l.count, 0), "", "", impact.totalMinutes, ""], [], ["Method", impact.method]);
    downloadCsv(`what-the-system-did-${impact.since}-to-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }
  useEffect(() => {
    fetch("/api/metrics/impact").then((r) => (r.ok ? r.json() : null)).then((j) => j && setImpact(j as Impact)).catch(() => {});
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
            <Link className="act ghost" href="/tenants">People</Link>
          </div>
        ) : n === 0 && !loading ? (
          <div className="decision">
            <div className="ic" aria-hidden="true">✓</div>
            <div><p className="t">You&apos;re clear.</p><p className="d">Come back tomorrow, or look at People while you wait.</p></div>
            <Link className="act ghost" href="/tenants">People</Link>
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
        <Link href="/tenants" className="stat"><div className="k">People housed</div><div className="v">{data ? data.stats.peopleHoused : "—"}</div><div className="m">active tenants</div></Link>
        <Link href="/ledger" className="stat"><div className="k">Money owed</div><div className={`v${data && data.stats.moneyOwed > 0 ? " money" : ""}`}>{data ? formatMoney(data.stats.moneyOwed) : "—"}</div><div className="m">{data ? (data.stats.moneyOwed > 0 ? "service charge past its due date" : "nobody is behind") : " "}</div></Link>
        <Link href="/tenants?filter=suspended" className="stat"><div className="k">Housing benefit</div><div className="v">{data ? data.stats.housingBenefitAtRisk : "—"}</div><div className="m">{data ? (data.stats.housingBenefitAtRisk === 0 ? "all claims paying" : "pending or suspended") : " "}</div></Link>
        <Link href="/maintenance" className="stat"><div className="k">Repairs</div><div className="v">{data ? data.stats.repairsOpen : "—"}</div><div className="m">{data ? (data.stats.repairsOpen === 0 ? "nothing open" : "open right now") : " "}</div></Link>
      </div>

      {impact && impact.lines.length > 0 && (
        <section className="card" style={{ marginTop: 18 }}>
          <div className="ch">
            <h3>What the system did for you · last {impact.days} days</h3>
            <span className="muted">≈ {impact.totalMinutes >= 60 ? `${(impact.totalMinutes / 60).toFixed(1)} hours` : `${impact.totalMinutes} min`} saved (estimate)</span>
          </div>
          {impact.lines.map((l) => {
            const open = openLine === l.key;
            return (
              <div key={l.key} style={{ borderBottom: "1px solid var(--line-soft)" }}>
                <button type="button" onClick={() => setOpenLine(open ? null : l.key)} aria-expanded={open}
                  className="li" style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", borderBottom: "none" }}>
                  <div className="body">
                    <b>{l.count.toLocaleString("en-GB")} × {l.label}</b>
                    <p>≈ {l.minutes} min · {open ? "hide the working" : "how is this counted?"}</p>
                  </div>
                  <span className="chev" aria-hidden="true" style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform .15s" }}>›</span>
                </button>
                {open && (
                  <div style={{ padding: "0 18px 14px", fontSize: 13 }}>
                    <p style={{ margin: "0 0 10px", color: "var(--slate)" }}><b style={{ color: "var(--navy)" }}>Counted how:</b> {l.method}</p>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                        <thead><tr style={{ textAlign: "left", color: "var(--slate)" }}>
                          <th style={th}>Who</th><th style={th}>What it did</th><th style={{ ...th, textAlign: "right" }}>Count (real)</th><th style={{ ...th, textAlign: "right" }}>Min each (assumed)</th><th style={th}>Why that many minutes</th><th style={{ ...th, textAlign: "right" }}>Minutes</th>
                        </tr></thead>
                        <tbody>
                          {l.breakdown.map((b, i) => (
                            <tr key={i} style={{ borderTop: "1px solid var(--line-soft)" }}>
                              <td style={td}>{b.agent ? <Link href={`/audit?agent=${encodeURIComponent(b.agent)}&from=${impact.since}`} style={{ color: "var(--navy)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{b.agent}</Link> : <span className="muted">system</span>}</td>
                              <td style={td}>{b.what}</td>
                              <td style={{ ...td, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{b.count.toLocaleString("en-GB")}</td>
                              <td style={{ ...td, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{b.minutesEach}</td>
                              <td style={{ ...td, color: "var(--slate)" }}>{b.why}</td>
                              <td style={{ ...td, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{b.count * b.minutesEach}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p style={{ margin: "10px 0 0" }}><Link href={l.evidence.href} style={{ color: "var(--amber-deep)", fontWeight: 600 }}>{l.evidence.label} →</Link></p>
                  </div>
                )}
              </div>
            );
          })}
          <div className="li" style={{ display: "block" }}>
            <p className="muted" style={{ margin: 0 }}>
              Counts are real — one row per write in the hash-chained audit trail, this workspace, since {impact.since}. The minutes are a stated assumption per kind of action (shown with the reason), not measured time.{" "}
              <button type="button" onClick={() => setShowMethod((v) => !v)} style={{ background: "none", border: "none", padding: 0, color: "var(--amber-deep)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" }}>{showMethod ? "Hide the method" : "Read the method"}</button>
              {" · "}
              <button type="button" onClick={exportImpact} style={{ background: "none", border: "none", padding: 0, color: "var(--amber-deep)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" }}>Export the working (CSV)</button>
            </p>
            {showMethod && <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--slate)" }}>{impact.method} If you think an assumption is wrong, say so — the number per action lives in one place (<code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>api/metrics/impact</code>) and changing it changes every line here.</p>}
          </div>
        </section>
      )}

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
