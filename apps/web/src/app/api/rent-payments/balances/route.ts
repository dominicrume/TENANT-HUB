import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { getApiAuth } from "../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../lib/safe-error";
import { landlordScope } from "../../../../lib/landlord-scope";

interface BalanceRow {
  tenant_id: string;
  org_id: string;
  total_charged: string | number;
  total_paid: string | number;
  balance: string | number;
}

/**
 * GET /api/rent-payments/balances — tenant_arrears_balance is a view
 * (supabase/migrations/034_money_and_arrears.sql) with its own org_id
 * column, carried over directly from service_charges/rent_payments. Scoped
 * explicitly here since there is no RLS behind the direct pg connection.
 */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json([]);

  try {
    // Landlord-scope: restrict to tenants in the active landlord's portfolio.
    const scope = landlordScope(auth, "viaTenant", { col: "tenant_id", paramIndex: 2 });
    const r = await db().query<BalanceRow>(`SELECT * FROM tenant_arrears_balance WHERE org_id = $1${scope.sql}`, [auth.actor.org_id, ...scope.params]);
    return NextResponse.json(r.rows);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
