import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { getApiAuth } from "../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../lib/safe-error";

/**
 * GET /api/audit-logs — append-only audit trail (RLS-scoped; managers see all).
 * Query params: limit, action, user (user_id), tenant (tenant_id), from, to.
 * Used by the dashboard recent-trail and the Sprint 5 audit-log page.
 *
 * Read-only by design (H1/the hash chain) — this route must never write to
 * audit_logs; writeWithAudit (packages/db) is the only writer, inside its own
 * transaction, so the chain can't be bypassed or forked from the API layer.
 *
 * audit_logs.org_id is nullable (added in migration 031, after rows already
 * existed, and agent-written rows may not set it). Supabase RLS
 * ("org_audit_read", migration 032) therefore scoped a row as visible if
 * EITHER its own org_id matches, OR its tenant_id is one of the caller's
 * org's tenants, OR its user_id is a profile in the caller's org — replicated
 * here as the same three-way OR, rather than a plain org_id match that would
 * silently hide legitimate older/agent rows.
 */
export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json([]);

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 200);
  const action = url.searchParams.get("action");
  const userId = url.searchParams.get("user");
  const tenantId = url.searchParams.get("tenant");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  // Drill-downs from the dashboard's "what the system did" card: by agent,
  // by table, or every automated row — so a count is always one click from
  // the rows behind it.
  const agent = url.searchParams.get("agent");
  const table = url.searchParams.get("table");
  const systemOnly = url.searchParams.get("system") === "1";

  const orgId = auth.actor.org_id;
  const params: unknown[] = [orgId];
  let sql = `SELECT * FROM audit_logs WHERE (
    org_id = $1
    OR tenant_id IN (SELECT id FROM tenants WHERE org_id = $1)
    OR user_id IN (SELECT id FROM profiles WHERE org_id = $1)
  )`;
  if (action) { params.push(action); sql += ` AND action = $${params.length}`; }
  if (userId) { params.push(userId); sql += ` AND user_id = $${params.length}`; }
  if (tenantId) { params.push(tenantId); sql += ` AND tenant_id = $${params.length}`; }
  if (from) { params.push(from); sql += ` AND created_at >= $${params.length}`; }
  if (to) { params.push(to); sql += ` AND created_at <= $${params.length}`; }
  if (agent) { params.push(agent); sql += ` AND (agent = $${params.length} OR user_name = 'System · ' || $${params.length})`; }
  if (table) { params.push(table); sql += ` AND table_name = $${params.length}`; }
  if (systemOnly) sql += ` AND (user_role = 'system' OR agent IS NOT NULL)`;
  params.push(limit);
  sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

  try {
    const r = await db().query<Record<string, unknown>>(sql, params);
    return NextResponse.json(r.rows);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
