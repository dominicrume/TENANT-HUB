import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { getApiAuth } from "../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

interface TenantRow { id: string; full_name: string; is_archived: boolean; housing_benefit_status: string | null; benefit_amount: number | null }

export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) {
    return NextResponse.json({ totalActiveTenants: 0, totalPendingHBClaims: 0, totalSuspendedHB: 0, expectedRevenue: 0, pendingRevenue: 0, alerts: [] });
  }

  let tenants: TenantRow[];
  try {
    const r = await db().query<TenantRow>(
      "SELECT id, full_name, is_archived, housing_benefit_status, benefit_amount FROM tenants WHERE org_id = $1",
      [auth.actor.org_id],
    );
    tenants = r.rows;
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }

  let totalActiveTenants = 0;
  let totalPendingHBClaims = 0;
  let totalSuspendedHB = 0;
  let expectedRevenue = 0;
  let pendingRevenue = 0;
  let alerts: Array<{ id: string, tenantId: string, tenantName: string, message: string, severity: 'high' | 'medium' | 'low' }> = [];

  tenants.forEach((t: any) => {
    if (t.is_archived) return; // Ignore archived tenants for active metrics

    totalActiveTenants++;

    if (t.housing_benefit_status === 'in_progress') {
      totalPendingHBClaims++;
      pendingRevenue += (t.benefit_amount || 0);

      // Note: hb_claim_date column doesn't exist in production DB yet.
      // Once the migration is applied, add it to the select() and re-enable date-based alerts.
      alerts.push({
        id: `hb-pending-${t.id}`,
        tenantId: t.id,
        tenantName: t.full_name,
        message: `Housing Benefit claim is in progress.`,
        severity: 'low'
      });
    } else if (t.housing_benefit_status === 'suspended') {
      totalSuspendedHB++;
      alerts.push({
        id: `hb-susp-${t.id}`,
        tenantId: t.id,
        tenantName: t.full_name,
        message: `Housing Benefit is suspended! Revenue at risk.`,
        severity: 'high'
      });
    } else if (t.housing_benefit_status === 'active') {
      expectedRevenue += (t.benefit_amount || 0);
    }
  });

  return NextResponse.json({
    totalActiveTenants,
    totalPendingHBClaims,
    totalSuspendedHB,
    expectedRevenue,
    pendingRevenue,
    alerts
  });
}
