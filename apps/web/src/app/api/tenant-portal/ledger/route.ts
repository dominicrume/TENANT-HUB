import { NextResponse } from "next/server";
import { getApiAuth } from "../../../../lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/tenant-portal/ledger
 *
 * Returns combined service charges + rent payments for the logged-in tenant,
 * sorted by date descending. Each entry has a `type` discriminator.
 */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (auth.actor.user_role !== "tenant") {
    return NextResponse.json({ error: "Tenant-only endpoint" }, { status: 403 });
  }

  // Resolve tenant_id from the user's profile
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

  // Fetch service charges
  const { data: charges, error: chargesErr } = await auth.supabase
    .from("service_charges")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("due_date", { ascending: false });

  if (chargesErr) return NextResponse.json({ error: chargesErr.message }, { status: 500 });

  // Fetch rent payments
  const { data: payments, error: paymentsErr } = await auth.supabase
    .from("rent_payments")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("payment_date", { ascending: false });

  if (paymentsErr) return NextResponse.json({ error: paymentsErr.message }, { status: 500 });

  // Fetch balance from the arrears view
  const { data: balanceData } = await auth.supabase
    .from("tenant_arrears_balance")
    .select("balance")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  // Map service charges to Charge UI structure
  const mappedCharges = (charges ?? []).map((c) => ({
    id: c.id,
    description: `Service Charge - Week ${c.week_label}`,
    amount: c.amount,
    due_date: c.due_date,
    status: c.is_paid ? "paid" : "unpaid",
    period: c.week_label,
  }));

  // Map rent payments to Payment UI structure
  const mappedPayments = (payments ?? []).map((p) => ({
    id: p.id,
    amount: p.amount,
    date: p.payment_date,
    method: p.payment_type,
    reference: p.reference_note ?? undefined,
  }));

  return NextResponse.json({
    charges: mappedCharges,
    payments: mappedPayments,
    balance: balanceData?.balance ?? 0,
  });
}
