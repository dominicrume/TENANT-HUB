import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { getApiAuth } from "../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/tenant-portal/ledger
 *
 * Returns combined service charges + rent payments for the logged-in tenant,
 * sorted by date descending. Each entry has a `type` discriminator.
 *
 * Security: this is a tenant viewing their own data, never a manager's view.
 * "Which tenant is this" is resolved the same way it always was — the
 * signed-in profile's own tenant_id (profiles.tenant_id, keyed off
 * auth.actor.user_id, the profile id) — and every query below is scoped to
 * that one tenant_id. Nothing here is reachable with any other tenant's id.
 */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (auth.actor.user_role !== "tenant") {
    return NextResponse.json({ error: "Tenant-only endpoint" }, { status: 403 });
  }

  try {
    // Resolve tenant_id from the user's own profile.
    const profileR = await db().query<{ tenant_id: string | null }>(
      "SELECT tenant_id FROM profiles WHERE id = $1", [auth.actor.user_id]);
    const tenantId = profileR.rows[0]?.tenant_id ?? null;

    if (!tenantId) {
      return NextResponse.json(
        { error: "No linked tenant record. Contact your manager." },
        { status: 404 },
      );
    }

    const [charges, payments, balanceR] = await Promise.all([
      db().query<{ id: string; week_label: string; amount: string; due_date: string; is_paid: boolean }>(
        "SELECT id, week_label, amount, due_date, is_paid FROM service_charges WHERE tenant_id = $1 ORDER BY due_date DESC", [tenantId]),
      db().query<{ id: string; amount: string; payment_date: string; payment_type: string; reference_note: string | null }>(
        "SELECT id, amount, payment_date, payment_type, reference_note FROM rent_payments WHERE tenant_id = $1 ORDER BY payment_date DESC", [tenantId]),
      db().query<{ balance: string }>(
        "SELECT balance FROM tenant_arrears_balance WHERE tenant_id = $1", [tenantId]),
    ]);

    // Map service charges to Charge UI structure
    const mappedCharges = charges.rows.map((c) => ({
      id: c.id,
      description: `Service Charge - Week ${c.week_label}`,
      amount: Number(c.amount),
      due_date: c.due_date,
      status: c.is_paid ? "paid" : "unpaid",
      period: c.week_label,
    }));

    // Map rent payments to Payment UI structure
    const mappedPayments = payments.rows.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      date: p.payment_date,
      method: p.payment_type,
      reference: p.reference_note ?? undefined,
    }));

    return NextResponse.json({
      charges: mappedCharges,
      payments: mappedPayments,
      balance: Number(balanceR.rows[0]?.balance ?? 0),
    });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
