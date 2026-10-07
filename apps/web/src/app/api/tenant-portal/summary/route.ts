import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { getApiAuth } from "../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/tenant-portal/summary
 *
 * Returns a combined summary for the logged-in tenant:
 *  - tenant record (room_number, full_name, moved_in, etc.)
 *  - open maintenance ticket count
 *  - balance info from tenant_arrears_balance view
 *
 * Security: tenant-only, scoped to the signed-in tenant's own record. "Which
 * tenant is this" is resolved from profiles.tenant_id keyed off
 * auth.actor.user_id (the profile id) — the same identity the original
 * Supabase-backed version used, now read directly instead of relying on RLS.
 */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (auth.actor.user_role !== "tenant") {
    return NextResponse.json({ error: "Tenant-only endpoint" }, { status: 403 });
  }

  try {
    // Resolve the tenant_id from the user's own profile.
    const profileR = await db().query<{ tenant_id: string | null }>(
      "SELECT tenant_id FROM profiles WHERE id = $1", [auth.actor.user_id]);
    const tenantId = profileR.rows[0]?.tenant_id ?? null;

    if (!tenantId) {
      return NextResponse.json(
        { error: "No linked tenant record. Contact your manager." },
        { status: 404 },
      );
    }

    const [tenantR, openTicketsR, balanceR] = await Promise.all([
      db().query<{ id: string; full_name: string; room_number: string | null; moved_in: string | null; email: string | null; mobile: string | null; is_active: boolean }>(
        "SELECT id, full_name, room_number, moved_in, email, mobile, is_active FROM tenants WHERE id = $1", [tenantId]),
      db().query<{ count: string }>(
        "SELECT COUNT(*) AS count FROM maintenance_tickets WHERE tenant_id = $1 AND status != 'Closed'", [tenantId]),
      db().query<{ total_charged: string; total_paid: string; balance: string }>(
        "SELECT total_charged, total_paid, balance FROM tenant_arrears_balance WHERE tenant_id = $1", [tenantId]),
    ]);

    const tenant = tenantR.rows[0] ?? null;
    const balance = balanceR.rows[0];

    return NextResponse.json({
      tenant,
      open_tickets: Number(openTicketsR.rows[0]?.count ?? 0),
      balance: {
        total_charged: Number(balance?.total_charged ?? 0),
        total_paid: Number(balance?.total_paid ?? 0),
        outstanding: Number(balance?.balance ?? 0),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
