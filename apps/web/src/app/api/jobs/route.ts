import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
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

  try {
    const r = await db().query<{
      id: string; proposed_at: string; dispatched_at: string | null; completed_at: string | null; cost: string | number | null;
      ticket_id: string | null; room_number: string | null; issue_type: string | null; category: string | null; severity: string | null;
      description: string | null; status: string | null; ticket_created_at: string | null; property_id: string | null;
    }>(
      `SELECT dj.id, dj.proposed_at, dj.dispatched_at, dj.completed_at, dj.cost,
              mt.id AS ticket_id, mt.room_number, mt.issue_type, mt.category, mt.severity, mt.description, mt.status, mt.created_at AS ticket_created_at, mt.property_id
       FROM dispatch_jobs dj
       JOIN trades t ON t.id = dj.trade_id
       LEFT JOIN maintenance_tickets mt ON mt.id = dj.ticket_id
       WHERE t.profile_id = $1
       ORDER BY dj.proposed_at DESC`,
      [auth.actor.user_id]);
    const data = r.rows.map(({ ticket_id, room_number, issue_type, category, severity, description, status, ticket_created_at, property_id, ...job }) => ({
      ...job,
      ticket: ticket_id ? { id: ticket_id, room_number, issue_type, category, severity, description, status, created_at: ticket_created_at, property_id } : null,
    }));
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
