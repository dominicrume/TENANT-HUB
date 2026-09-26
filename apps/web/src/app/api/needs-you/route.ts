import { NextResponse } from "next/server";
import { withRouteHandler } from "../../../lib/api-handler";
import { buildNeedsYou, type TenantRow, type ChargeRow, type TicketRow, type DraftRow, type HandoverRow } from "@tenant-hub/domain";

export const dynamic = "force-dynamic";

/**
 * GET /api/needs-you — the decisions waiting for a person, plus the four stat
 * tiles, in one response. One query set feeds both the Today page and the nav
 * badge (H8). Reads run as the signed-in user, so RLS applies.
 */
export const GET = withRouteHandler({ resource: "tenants", action: "read" }, async (_req, _ctx, auth) => {
  const today = new Date().toISOString().slice(0, 10);
  const sb = auth.supabase;

  const [tenants, charges, tickets, drafts, handovers] = await Promise.all([
    sb.from("tenants").select("id, full_name, room_number, is_active, is_archived, housing_benefit_status, hb_claim_date, moved_in"),
    sb.from("service_charges").select("tenant_id, amount, is_paid, due_date").eq("is_paid", false),
    sb.from("maintenance_tickets").select("id, room_number, issue_type, status, assigned_to, reported_by, created_at").not("status", "in", '("Resolved","Closed")'),
    sb.from("drafts").select("id, step, expires_at, machine_state").gte("step", 3),
    sb.from("shift_handovers").select("id, shift_date").eq("shift_date", today),
  ]);

  const failed = [tenants, charges, tickets, drafts, handovers].find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  return NextResponse.json(
    buildNeedsYou({
      tenants: (tenants.data ?? []) as TenantRow[],
      charges: (charges.data ?? []) as ChargeRow[],
      tickets: (tickets.data ?? []) as TicketRow[],
      drafts: (drafts.data ?? []) as DraftRow[],
      handoversToday: (handovers.data ?? []) as HandoverRow[],
    }),
    { headers: { "Cache-Control": "no-store" } },
  );
});
