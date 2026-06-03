import { NextResponse } from "next/server";
import { getApiAuth } from "../../../lib/api-auth";

/**
 * GET /api/audit-logs — append-only audit trail (RLS-scoped; managers see all).
 * Query params: limit, action, user (user_id), tenant (tenant_id), from, to.
 * Used by the dashboard recent-trail and the Sprint 5 audit-log page.
 */
export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 200);
  const action = url.searchParams.get("action");
  const userId = url.searchParams.get("user");
  const tenantId = url.searchParams.get("tenant");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let query = auth.supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (action) query = query.eq("action", action);
  if (userId) query = query.eq("user_id", userId);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
