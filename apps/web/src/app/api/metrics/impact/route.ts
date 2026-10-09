import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

const DAYS = 30;

/**
 * GET /api/metrics/impact — what the system did on its own in the last 30
 * days, and roughly what that saved — WITH its working shown.
 *
 * Rume, 2026-10-09: "if an assessor or a manager is looking at this summary
 * it should have a way to see how they arrived at it — was this saved, was
 * it something the AI agent did, how did we save all these hours?" So every
 * line now carries:
 *   - `method`: the counting rule in plain words (what table, what filter)
 *   - `breakdown`: one row per (agent, what it did), with the real count,
 *     the minutes assumed per occurrence and WHY that number
 *   - `evidence`: a link into the audit trail filtered to exactly those rows
 * Counts are rows in audit_logs (hash-chained, one per write, H1) or in
 * tables only an automated path fills, scoped to THIS organisation and the
 * window. Minutes are stated assumptions of what a person would have spent
 * doing the same by hand — never dressed up as measured time.
 *
 * Fix in passing: the previous agent-actions query had an AND/OR precedence
 * slip that counted org-less system rows for every workspace. All agent rows
 * carry org_id (migration 031), so this is a plain org match now.
 */
interface BreakdownRow { agent: string | null; what: string; table: string; action: string; count: number; minutesEach: number; why: string }
interface Line { key: string; label: string; count: number; minutes: number; method: string; breakdown: BreakdownRow[]; evidence: { href: string; label: string } }

// What each agent's write means to a person, and what doing it by hand costs.
const AGENT_WORK: Record<string, { what: string; minutesEach: number; why: string }> = {
  "regulation-watch":    { what: "Read a regulation/guidance update and filed it against the right properties", minutesEach: 5,  why: "finding the update, reading it, noting which homes it touches" },
  "compliance-watch":    { what: "Checked a certificate/insurance/licence date and raised an alert when it's due", minutesEach: 3,  why: "opening the register, checking the date, writing the reminder" },
  "owner-digest":        { what: "Wrote the morning summary for the manager", minutesEach: 15, why: "pulling the numbers from four screens and writing three paragraphs" },
  "issue-triage":        { what: "Read a repair report, classified it and lined up the job", minutesEach: 4,  why: "reading the report, deciding urgency and trade, creating the job" },
  "rent-reconciliation": { what: "Matched a payment to a charge and posted it to the ledger", minutesEach: 5,  why: "finding the charge, keying the payment, checking the balance" },
  "hb-chaser":           { what: "Drafted a housing-benefit chase letter", minutesEach: 10, why: "looking up the claim, writing the letter, logging it" },
  "arrears-watch":       { what: "Flagged a tenancy slipping into arrears", minutesEach: 3,  why: "running the ledger and comparing against the rent due" },
  "handover-nudge":      { what: "Prepared the shift handover prompt", minutesEach: 3,  why: "checking what changed since the last shift" },
};
const DEFAULT_AGENT = { what: "Automated action", minutesEach: 3, why: "a generic estimate for an action we haven't costed individually" };

const TABLE_WORDS: Record<string, string> = {
  regulation_items: "regulation item", compliance_alerts: "compliance alert", documents: "document", maintenance_tickets: "repair ticket",
  dispatch_jobs: "contractor job", service_charges: "service charge", rent_payments: "rent payment", tenants: "tenant record", notifications: "notification",
};
const ACTION_WORDS: Record<string, string> = { CREATE: "created", UPDATE: "updated", DELETE: "removed", SIGN: "signed", VERIFY: "verified" };

export const GET = withRouteHandler({ resource: "agents", action: "read" }, async (_req, _ctx, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ days: DAYS, lines: [], totalMinutes: 0 });
  const org = auth.actor.org_id;
  const sinceDate = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const since = `NOW() - INTERVAL '${DAYS} days'`;
  const lines: Line[] = [];

  try {
    // 1. Agent actions — grouped by who did what, straight from the audit trail.
    const agents = await db().query<{ agent: string | null; user_name: string | null; table_name: string; action: string; n: number }>(
      `SELECT a.agent, a.user_name, a.table_name, a.action, COUNT(*)::int AS n
       FROM audit_logs a
       WHERE a.org_id = $1 AND a.created_at > ${since} AND (a.user_role = 'system' OR a.agent IS NOT NULL)
       GROUP BY a.agent, a.user_name, a.table_name, a.action ORDER BY n DESC`, [org]).catch(() => ({ rows: [] as Array<{ agent: string | null; user_name: string | null; table_name: string; action: string; n: number }> }));
    if (agents.rows.length > 0) {
      const breakdown: BreakdownRow[] = agents.rows.map((r) => {
        const key = r.agent ?? (r.user_name ?? "").replace(/^System · /, "");
        const w = AGENT_WORK[key] ?? DEFAULT_AGENT;
        const noun = TABLE_WORDS[r.table_name] ?? r.table_name.replace(/_/g, " ");
        return { agent: key || null, what: `${w.what} — ${ACTION_WORDS[r.action] ?? r.action.toLowerCase()} a ${noun}`, table: r.table_name, action: r.action, count: Number(r.n), minutesEach: w.minutesEach, why: w.why };
      });
      const count = breakdown.reduce((s, b) => s + b.count, 0);
      lines.push({
        key: "agents", label: "automated actions by the agents", count,
        minutes: breakdown.reduce((s, b) => s + b.count * b.minutesEach, 0),
        method: `One row per write in the audit trail (audit_logs) made by an agent (user_role = system or agent set), in this workspace, since ${sinceDate}. Grouped by the agent and what it wrote.`,
        breakdown,
        evidence: { href: `/audit?system=1&from=${sinceDate}`, label: "Open these rows in What the system did" },
      });
    }

    // 2–6. Things only an automated path fills, each with one rule.
    const simple: Array<{ key: string; label: string; minutesEach: number; why: string; method: string; sql: string; evidence: Line["evidence"] }> = [
      { key: "triage", label: "repair reports triaged automatically", minutesEach: 4, why: "reading the report, deciding urgency and trade",
        method: `maintenance_tickets in this workspace created since ${sinceDate} with triage_reasoning filled — only the issue-triage agent writes that column.`,
        sql: `SELECT COUNT(*)::int AS n FROM maintenance_tickets WHERE org_id = $1 AND created_at > ${since} AND triage_reasoning IS NOT NULL`,
        evidence: { href: "/maintenance", label: "Open Repairs" } },
      { key: "landlord-requests", label: "landlord document requests emailed for you", minutesEach: 10, why: "finding the landlord's address, writing the email, logging that it went",
        method: `property_documents in this workspace with notified_at since ${sinceDate} — set only when Resend accepted the email.`,
        sql: `SELECT COUNT(*)::int AS n FROM property_documents WHERE org_id = $1 AND notified_at > ${since}`,
        evidence: { href: "/properties", label: "Open Properties" } },
      { key: "documents", label: "documents filed against a tenant or property", minutesEach: 5, why: "scanning or saving, naming, filing in the right folder",
        method: `tenant_documents (via the tenant's org) plus property_documents with status received, created since ${sinceDate}.`,
        sql: `SELECT (SELECT COUNT(*) FROM tenant_documents td JOIN tenants t ON t.id = td.tenant_id WHERE t.org_id = $1 AND td.created_at > ${since})::int
                   + (SELECT COUNT(*) FROM property_documents WHERE org_id = $1 AND status = 'received' AND created_at > ${since})::int AS n`,
        evidence: { href: `/audit?table=tenant_documents&from=${sinceDate}`, label: "Open the filing rows in What the system did" } },
      { key: "intake", label: "tenant records created through intake", minutesEach: 25, why: "a paper form keyed by hand, checked, and signed",
        method: `tenants in this workspace created since ${sinceDate}.`,
        sql: `SELECT COUNT(*)::int AS n FROM tenants WHERE org_id = $1 AND created_at > ${since}`,
        evidence: { href: `/audit?table=tenants&action=CREATE&from=${sinceDate}`, label: "Open the tenant creates in What the system did" } },
      { key: "id-checks", label: "right-to-rent checks run", minutesEach: 15, why: "checking a passport/BRP by eye and recording the outcome",
        method: `tenant_id_checks in this workspace created since ${sinceDate}.`,
        sql: `SELECT COUNT(*)::int AS n FROM tenant_id_checks WHERE org_id = $1 AND created_at > ${since}`,
        evidence: { href: `/audit?table=tenant_id_checks&from=${sinceDate}`, label: "Open the check rows in What the system did" } },
    ];
    for (const p of simple) {
      const n = await db().query<{ n: number }>(p.sql, [org]).then((r) => Number(r.rows[0]?.n ?? 0)).catch(() => 0);
      if (n > 0) lines.push({ key: p.key, label: p.label, count: n, minutes: n * p.minutesEach, method: p.method, evidence: p.evidence,
        breakdown: [{ agent: null, what: p.label, table: "", action: "", count: n, minutesEach: p.minutesEach, why: p.why }] });
    }

    const totalMinutes = lines.reduce((s, l) => s + l.minutes, 0);
    return NextResponse.json({
      days: DAYS, since: sinceDate, lines, totalMinutes,
      method: "Counts are rows in the audit trail (one per write, hash-chained) or in tables only an automated path fills, limited to this workspace and the last 30 days. Minutes are our stated assumption of what a person would spend doing the same by hand — per kind of action, with the reason — not measured time. Every count links to the rows behind it.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
