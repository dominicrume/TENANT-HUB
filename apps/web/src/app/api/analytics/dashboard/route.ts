import { NextResponse } from "next/server";
import { getApiAuth } from "../../../../lib/api-auth";

export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { data: tenants, error } = await auth.supabase
    .from("tenants")
    .select("id, full_name, is_archived, housing_benefit_status, benefit_amount")
    
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
