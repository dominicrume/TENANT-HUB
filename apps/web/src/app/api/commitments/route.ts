import { NextResponse } from "next/server";
import { withRouteHandler } from "../../../lib/api-handler";

export const dynamic = "force-dynamic";

/**
 * GET /api/commitments?tenant=<id> — the still-open promises on a tenant's
 * record ("Before your next contact"), overdue ones first, then open,
 * earliest due date first within each. interaction-memory (apps/worker) is the only
 * writer; this route only ever reads. RLS scopes every row to the caller's
 * organisation (supabase/migrations/037_commitments.sql).
 */
export const GET = withRouteHandler({ resource: "interactions", action: "read" }, async (req, _ctx, auth) => {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenant");

  let query = auth.supabase
    .from("commitments")
    .select("id, tenant_id, source_table, text, owner, due_on, status, created_at")
    .neq("status", "done")
    .order("status", { ascending: false }) // "overdue" > "open" lexically — overdue leads
    .order("due_on", { ascending: true, nullsFirst: false });

  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? [], { headers: { "Cache-Control": "no-store" } });
});
