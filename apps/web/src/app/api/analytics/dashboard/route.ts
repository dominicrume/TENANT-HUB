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

  const now = new Date();

  tenants.forEach((t: any) => {
    if (t.is_archived) return; // Ignore archived tenants for active metrics

    totalActiveTenants++;

    if (t.housing_benefit_status === 'in_progress') {
      totalPendingHBClaims++;
      pendingRevenue += (t.benefit_amount || 0);

      if (t.hb_claim_date) {
        const claimDate = new Date(t.hb_claim_date);
        const daysDiff = Math.floor((now.getTime() - claimDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff > 14) {
          alerts.push({
            id: `hb-delay-${t.id}`,
            tenantId: t.id,
            tenantName: t.full_name,
            message: `Housing Benefit claim pending for ${daysDiff} days.`,
            severity: 'medium'
          });
        }
      } else {
        alerts.push({
            id: `hb-missing-date-${t.id}`,
            tenantId: t.id,
            tenantName: t.full_name,
            message: `Housing Benefit claim is in progress but no claim date provided.`,
            severity: 'low'
        });
      }
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
