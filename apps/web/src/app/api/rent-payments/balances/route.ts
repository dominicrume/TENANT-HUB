import { NextResponse } from "next/server";
import { getApiAuth } from "../../../../lib/api-auth";

/** GET /api/rent-payments/balances */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // tenant_arrears_balance is a view joining tenants (RLS restricted), service_charges, and rent_payments.
  // Wait, views don't inherit RLS automatically unless configured with security invoker,
  // but since we query the view, we can just filter by org_id.
  const { data, error } = await auth.supabase
    .from("tenant_arrears_balance")
    .select("*")
    .eq("org_id", auth.actor.org_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
