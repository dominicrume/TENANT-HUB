import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { getApiAuth } from "../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../lib/safe-error";

/**
 * GET /api/risk-flags — rule-based risk flags derived from live data.
 * Currently flags arrears (2+ overdue unpaid weeks). AI-detected safeguarding
 * concerns can be layered on later via /api/ai/task; this gives a real,
 * deterministic signal without a dedicated table.
 *
 * Staff-facing: scoped to the signed-in staff member's own organisation.
 * service_charges has no org_id column of its own, so it's scoped via its
 * tenant's org_id (the same relationship Supabase RLS used to enforce).
 */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json([]);

  const today = new Date().toISOString().slice(0, 10);

  try {
    const [tenantsR, chargesR] = await Promise.all([
      db().query<{ id: string; full_name: string; room_number: string | null }>(
        "SELECT id, full_name, room_number FROM tenants WHERE org_id = $1 AND is_active = true AND is_archived = false",
        [auth.actor.org_id]),
      db().query<{ tenant_id: string; is_paid: boolean; due_date: string }>(
        `SELECT sc.tenant_id, sc.is_paid, sc.due_date
         FROM service_charges sc
         JOIN tenants t ON t.id = sc.tenant_id
         WHERE t.org_id = $1`,
        [auth.actor.org_id]),
    ]);

    const overdueByTenant = new Map<string, number>();
    for (const c of chargesR.rows) {
      if (!c.is_paid && c.due_date < today) {
        overdueByTenant.set(c.tenant_id, (overdueByTenant.get(c.tenant_id) ?? 0) + 1);
      }
    }

    const flags = tenantsR.rows
      .map((t) => {
        const weeks = overdueByTenant.get(t.id) ?? 0;
        if (weeks < 2) return null;
        return {
          tenant_id: t.id,
          name: t.full_name,
          room: t.room_number,
          reason: `${weeks} weeks in arrears`,
          severity: weeks >= 4 ? "High" : "Medium",
        };
      })
      .filter(Boolean);

    return NextResponse.json(flags);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
