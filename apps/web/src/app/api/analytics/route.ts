import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { getApiAuth } from "../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../lib/safe-error";

/**
 * GET /api/analytics — dashboard headline stats. sessions, service_charges
 * and tenant_goals have no org_id column of their own (supabase/migrations/
 * 001, 012) — Supabase RLS scoped all three via tenant_id -> tenants.org_id
 * (visible_tenant_ids()), so every query here joins through tenants the
 * same way.
 */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) {
    return NextResponse.json({
      totalTenants: 0, totalSessions: 0, totalBilled: 0, totalPaid: 0,
      arrearsRecoveryRate: 100, goalsActive: 0, goalsCompleted: 0, aiHoursSaved: 0,
    });
  }
  const orgId = auth.actor.org_id;

  try {
    // 1. Total Tenants
    const tenantsR = await db().query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM tenants WHERE org_id = $1", [orgId]);
    const totalTenants = Number(tenantsR.rows[0]?.count ?? 0);

    // 2. Total Sessions
    const sessionsR = await db().query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM sessions s
       JOIN tenants t ON t.id = s.tenant_id WHERE t.org_id = $1`, [orgId]);
    const totalSessions = Number(sessionsR.rows[0]?.count ?? 0);

    // 3. Arrears Recovery (Service Charges)
    const chargesR = await db().query<{ amount: string; is_paid: boolean }>(
      `SELECT sc.amount, sc.is_paid FROM service_charges sc
       JOIN tenants t ON t.id = sc.tenant_id WHERE t.org_id = $1`, [orgId]);

    let totalBilled = 0;
    let totalPaid = 0;
    chargesR.rows.forEach((c) => {
      totalBilled += Number(c.amount);
      if (c.is_paid) totalPaid += Number(c.amount);
    });

    const arrearsRecoveryRate = totalBilled > 0 ? (totalPaid / totalBilled) * 100 : 100;

    // 4. Goals Completed
    const goalsR = await db().query<{ status: string }>(
      `SELECT g.status FROM tenant_goals g
       JOIN tenants t ON t.id = g.tenant_id WHERE t.org_id = $1`, [orgId]);

    let goalsCompleted = 0;
    goalsR.rows.forEach((g) => {
      if (g.status === "Completed") goalsCompleted++;
    });

    // 5. AI Efficiency (Dummy logic: each tenant onboarded via AI saves ~4 hours of manual data entry and formatting)
    const aiHoursSaved = totalTenants * 4;

    return NextResponse.json({
      totalTenants,
      totalSessions,
      totalBilled,
      totalPaid,
      arrearsRecoveryRate,
      goalsActive: goalsR.rows.length - goalsCompleted,
      goalsCompleted,
      aiHoursSaved,
    });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
