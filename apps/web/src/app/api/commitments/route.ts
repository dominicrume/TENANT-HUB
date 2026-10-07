import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { withRouteHandler } from "../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../lib/safe-error";

export const dynamic = "force-dynamic";

interface CommitmentRow {
  id: string; tenant_id: string | null; source_table: string; text: string;
  owner: string; due_on: string | null; status: string; created_at: string;
}

/**
 * GET /api/commitments?tenant=<id> — the still-open promises on a tenant's
 * record ("Before your next contact"), overdue ones first, then open,
 * earliest due date first within each. interaction-memory (apps/worker) is the only
 * writer; this route only ever reads. org_id scoping replaces what Supabase
 * RLS did implicitly (supabase/migrations/037_commitments.sql, org_id NOT NULL).
 */
export const GET = withRouteHandler({ resource: "interactions", action: "read" }, async (req, _ctx, auth) => {
  if (!auth.actor.org_id) return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenant");

  const params: unknown[] = [auth.actor.org_id];
  let sql = `SELECT id, tenant_id, source_table, text, owner, due_on, status, created_at
             FROM commitments WHERE org_id = $1 AND status <> 'done'`;
  if (tenantId) {
    params.push(tenantId);
    sql += ` AND tenant_id = $${params.length}`;
  }
  // "overdue" > "open" lexically — overdue leads, same ordering as the original query.
  sql += ` ORDER BY status DESC, due_on ASC NULLS LAST`;

  try {
    const r = await db().query<CommitmentRow>(sql, params);
    return NextResponse.json(r.rows, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
