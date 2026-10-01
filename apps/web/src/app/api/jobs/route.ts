import { NextResponse } from "next/server";
import { getApiAuth } from "../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../lib/safe-error";

/**
 * GET /api/jobs — a contractor's own dispatched jobs (BUILD_PLAN C33).
 *
 * Read-only by design: the RBAC matrix (packages/auth/src/rbac.ts,
 * CI-enforced by rbac.test.ts) grants contractor only "read" on maintenance —
 * marking a job complete is a staff action on the Repairs board, not
 * something this route, or the page that calls it, ever offers a contractor.
 *
 * Relies on two RLS policies added in migration 042 after this page surfaced
 * that a contractor could never actually see a job dispatched to them —
 * org_dispatch_read's own subquery, and the ticket embed, were both silently
 * empty under RLS before that fix.
 */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (auth.actor.user_role !== "contractor") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await auth.supabase
    .from("dispatch_jobs")
    .select("id, proposed_at, dispatched_at, completed_at, cost, ticket:maintenance_tickets(id, room_number, issue_type, category, severity, description, status, created_at, property_id)")
    .order("proposed_at", { ascending: false });

  if (error) return NextResponse.json({ error: toSafeErrorMessage(error) }, { status: 500 });
  return NextResponse.json(data ?? []);
}
