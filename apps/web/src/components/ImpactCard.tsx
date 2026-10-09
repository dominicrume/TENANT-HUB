"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { downloadCsv } from "../lib/csv";

/**
 * "What the system did for you" — counts from the audit trail with the
 * working shown (per-agent breakdown, stated minutes, evidence links).
 * Lives on the What the system did page only (Rume, 2026-10-09: "why is
 * this still on the dashboard when there's a dedicated tab — it's making
 * the dashboard busy"). The dashboard stays for decisions.
 */
interface BreakdownRow { agent: string | null; what: string; table: string; action: string; count: number; minutesEach: number; why: string }
interface ImpactLine { key: string; label: string; count: number; minutes: number; method: string; breakdown: BreakdownRow[]; evidence: { href: string; label: string } }
interface Impact { days: number; since: string; lines: ImpactLine[]; totalMinutes: number; method: string }

const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 600, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "7px 8px", verticalAlign: "top" };
const linkBtn: React.CSSProperties = { background: "none", border: "none", padding: 0, color: "var(--amber-deep)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" };

export function ImpactCard() {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [openLine, setOpenLine] = useState<string | null>(null);
  const [showMethod, setShowMethod] = useState(false);

  useEffect(() => {
    fetch("/api/metrics/impact").then((r) => (r.ok ? r.json() : null)).then((j) => j && setImpact(j as Impact)).catch(() => {});
  }, []);

  // For an assessor: the whole working as a spreadsheet — agent, what it
  // did, count, minutes assumed and why, and where the evidence is.
  function exportImpact() {
    if (!impact) return;
    const rows: (string | number)[][] = [["Line", "Agent", "What it did", "Audit table", "Action", "Count (real)", "Minutes each (assumed)", "Why that many minutes", "Minutes total", "Evidence"]];
    for (const l of impact.lines) for (const b of l.breakdown) rows.push([l.label, b.agent ?? "", b.what, b.table, b.action, b.count, b.minutesEach, b.why, b.count * b.minutesEach, `${window.location.origin}${l.evidence.href}`]);
    rows.push([], ["Total", "", "", "", "", impact.lines.reduce((s, l) => s + l.count, 0), "", "", impact.totalMinutes, ""], [], ["Method", impact.method]);
    downloadCsv(`what-the-system-did-${impact.since}-to-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  if (!impact || impact.lines.length === 0) return null;

  return (
    <section className="card" style={{ marginBottom: 18 }}>
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
          <button type="button" onClick={() => setShowMethod((v) => !v)} style={linkBtn}>{showMethod ? "Hide the method" : "Read the method"}</button>
          {" · "}
          <button type="button" onClick={exportImpact} style={linkBtn}>Export the working (CSV)</button>
        </p>
        {showMethod && <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--slate)" }}>{impact.method} If you think an assumption is wrong, say so — the number per action lives in one place (<code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>api/metrics/impact</code>) and changing it changes every line here.</p>}
      </div>
    </section>
  );
}
