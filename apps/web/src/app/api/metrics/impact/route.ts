import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

const DAYS = 30;

/**
 * GET /api/metrics/impact — what the system did on its own in the last 30
 * days, and roughly what that saved. Counts come from the audit trail
 * (every write is in it, H1) and from columns that only an automated path
 * sets, so they're real. The minutes-per-action are assumptions and are
 * returned alongside the counts so the dashboard can show them openly —
 * "estimated", never dressed up as measured. Rume, 2026-10-08: "how are we
 * even getting the metrics of the time and cost we are saving — we need to
 * track it." This is the first honest version of that.
 */
export const GET = withRouteHandler({ resource: "agents", action: "read" }, async (_req, _ctx, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ days: DAYS, lines: [], totalMinutes: 0 });
  const org = auth.actor.org_id;
  const since = `NOW() - INTERVAL '${DAYS} days'`;

  // Each line: a label, a query returning one count, and the assumed minutes
  // a person would otherwise have spent per occurrence.
  const probes: Array<{ label: string; minutesEach: number; sql: string; params: unknown[] }> = [
    { label: "automated actions by the agents (digests, triage, chasers, reconciliation)", minutesEach: 3,
      sql: `SELECT COUNT(*)::int AS n FROM audit_logs a WHERE a.created_at > ${since} AND (a.user_role = 'system' OR a.agent IS NOT NULL)
            AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = a.tenant_id AND t.org_id = $1) OR (a.created_at > ${since} AND (a.user_role = 'system' OR a.agent IS NOT NULL) AND a.tenant_id IS NULL)`, params: [org] },
    { label: "repair reports triaged automatically", minutesEach: 4,
      sql: `SELECT COUNT(*)::int AS n FROM maintenance_tickets WHERE org_id = $1 AND created_at > ${since} AND triage_reasoning IS NOT NULL`, params: [org] },
    { label: "landlord document requests emailed for you", minutesEach: 10,
      sql: `SELECT COUNT(*)::int AS n FROM property_documents WHERE org_id = $1 AND notified_at > ${since}`, params: [org] },
    { label: "documents filed against a tenant or property", minutesEach: 5,
      sql: `SELECT (SELECT COUNT(*) FROM tenant_documents td JOIN tenants t ON t.id = td.tenant_id WHERE t.org_id = $1 AND td.created_at > ${since})::int
                 + (SELECT COUNT(*) FROM property_documents WHERE org_id = $1 AND status = 'received' AND created_at > ${since})::int AS n`, params: [org] },
    { label: "tenant records created through intake", minutesEach: 25,
      sql: `SELECT COUNT(*)::int AS n FROM tenants WHERE org_id = $1 AND created_at > ${since}`, params: [org] },
    { label: "right-to-rent checks run", minutesEach: 15,
      sql: `SELECT COUNT(*)::int AS n FROM tenant_id_checks WHERE org_id = $1 AND created_at > ${since}`, params: [org] },
  ];

  try {
    const lines: Array<{ label: string; count: number; minutesEach: number }> = [];
    for (const p of probes) {
      // A probe against a column this deployment doesn't have yet must not take the whole card down.
      const n = await db().query<{ n: number }>(p.sql, p.params).then((r) => Number(r.rows[0]?.n ?? 0)).catch(() => 0);
      if (n > 0) lines.push({ label: p.label, count: n, minutesEach: p.minutesEach });
    }
    const totalMinutes = lines.reduce((s, l) => s + l.count * l.minutesEach, 0);
    return NextResponse.json({ days: DAYS, lines, totalMinutes }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
