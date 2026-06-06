import { NextResponse } from "next/server";
import { getApiAuth } from "../../../lib/api-auth";

export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Gather basic stats for the dashboard
  
  // 1. Total Tenants
  const { count: totalTenants } = await auth.supabase
    .from("tenants")
    .select("*", { count: "exact", head: true });

  // 2. Total Sessions
  const { count: totalSessions } = await auth.supabase
    .from("sessions")
    .select("*", { count: "exact", head: true });

  // 3. Arrears Recovery (Service Charges)
  const { data: charges } = await auth.supabase
    .from("service_charges")
    .select("amount, is_paid");

  let totalBilled = 0;
  let totalPaid = 0;
  charges?.forEach(c => {
    totalBilled += Number(c.amount);
    if (c.is_paid) totalPaid += Number(c.amount);
  });
  
  const arrearsRecoveryRate = totalBilled > 0 ? (totalPaid / totalBilled) * 100 : 100;

  // 4. Goals Completed
  const { data: goals } = await auth.supabase
    .from("tenant_goals")
    .select("status");

  let goalsCompleted = 0;
  goals?.forEach(g => {
    if (g.status === "Completed") goalsCompleted++;
  });

  // 5. AI Efficiency (Dummy logic: each tenant onboarded via AI saves ~4 hours of manual data entry and formatting)
  const aiHoursSaved = (totalTenants || 0) * 4;

  return NextResponse.json({
    totalTenants: totalTenants || 0,
    totalSessions: totalSessions || 0,
    totalBilled,
    totalPaid,
    arrearsRecoveryRate,
    goalsActive: (goals?.length || 0) - goalsCompleted,
    goalsCompleted,
    aiHoursSaved
  });
}
