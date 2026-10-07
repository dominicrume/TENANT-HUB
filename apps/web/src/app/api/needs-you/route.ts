import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { withRouteHandler } from "../../../lib/api-handler";
import { buildNeedsYou, type TenantRow, type ChargeRow, type TicketRow, type DraftRow, type HandoverRow } from "@tenant-hub/domain";
import { toSafeErrorMessage } from "../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/needs-you — the decisions waiting for a person, plus the four stat
 * tiles, in one response. One query set feeds both the Today page and the nav
 * badge (H8). Reads via packages/db with explicit org_id scoping, replacing
 * what Supabase RLS used to scope implicitly:
 *  - tenants, maintenance_tickets, shift_handovers carry org_id directly.
 *  - service_charges has no org_id of its own — scoped via its tenant.
 *  - drafts has neither org_id nor tenant_id — scoped via created_by's profile.
 */
export const GET = withRouteHandler({ resource: "tenants", action: "read" }, async (_req, _ctx, auth) => {
  if (!auth.actor.org_id) {
    return NextResponse.json(
      buildNeedsYou({ tenants: [], charges: [], tickets: [], drafts: [], handoversToday: [] }),
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const orgId = auth.actor.org_id;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const [tenants, charges, tickets, drafts, handovers] = await Promise.all([
      db().query<TenantRow>(
        `SELECT id, full_name, room_number, is_active, is_archived, housing_benefit_status, hb_claim_date, moved_in
         FROM tenants WHERE org_id = $1`,
        [orgId],
      ),
      db().query<ChargeRow>(
        `SELECT sc.tenant_id, sc.amount, sc.is_paid, sc.due_date
         FROM service_charges sc JOIN tenants t ON t.id = sc.tenant_id
         WHERE t.org_id = $1 AND sc.is_paid = false`,
        [orgId],
      ),
      db().query<TicketRow>(
        `SELECT id, room_number, issue_type, status, assigned_to, reported_by, created_at
         FROM maintenance_tickets WHERE org_id = $1 AND status NOT IN ('Resolved', 'Closed')`,
        [orgId],
      ),
      db().query<DraftRow>(
        `SELECT d.id, d.step, d.expires_at, d.machine_state
         FROM drafts d JOIN profiles p ON p.id = d.created_by
         WHERE p.org_id = $1 AND d.step >= 3`,
        [orgId],
      ),
      db().query<HandoverRow>(
        `SELECT id, shift_date FROM shift_handovers WHERE org_id = $1 AND shift_date = $2`,
        [orgId, today],
      ),
    ]);

    return NextResponse.json(
      buildNeedsYou({
        tenants: tenants.rows,
        charges: charges.rows,
        tickets: tickets.rows,
        drafts: drafts.rows,
        handoversToday: handovers.rows,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
