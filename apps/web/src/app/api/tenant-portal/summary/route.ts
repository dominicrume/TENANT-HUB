import { NextResponse } from "next/server";
import { getApiAuth } from "../../../../lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/tenant-portal/summary
 *
 * Returns a combined summary for the logged-in tenant:
 *  - tenant record (room_number, full_name, moved_in, etc.)
 *  - open maintenance ticket count
 *  - balance info from tenant_arrears_balance view
 */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (auth.actor.user_role !== "tenant") {
    return NextResponse.json({ error: "Tenant-only endpoint" }, { status: 403 });
  }

  // Resolve the tenant_id from the user's profile
  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", auth.actor.user_id)
    .single();

  const tenantId = (profile as Record<string, unknown> | null)?.tenant_id as string | null;

  if (!tenantId) {
    return NextResponse.json(
      { error: "No linked tenant record. Contact your manager." },
      { status: 404 },
    );
  }

  // Fetch tenant record
  const { data: tenant, error: tenantErr } = await auth.supabase
    .from("tenants")
    .select("id, full_name, room_number, moved_in, email, mobile, is_active")
    .eq("id", tenantId)
    .single();

  if (tenantErr) return NextResponse.json({ error: tenantErr.message }, { status: 500 });

  // Count open maintenance tickets
  const { count: openTickets } = await auth.supabase
    .from("maintenance_tickets")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .neq("status", "Closed");

  // Balance from the arrears view
  const { data: balance } = await auth.supabase
    .from("tenant_arrears_balance")
    .select("total_charged, total_paid, balance")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return NextResponse.json({
    tenant,
    open_tickets: openTickets ?? 0,
    balance: {
      total_charged: (balance?.total_charged as number) ?? 0,
      total_paid: (balance?.total_paid as number) ?? 0,
      outstanding: (balance?.balance as number) ?? 0,
    },
  });
}
