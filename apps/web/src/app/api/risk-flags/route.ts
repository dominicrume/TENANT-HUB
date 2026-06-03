import { NextResponse } from "next/server";
import { getApiAuth } from "../../../lib/api-auth";

/**
 * GET /api/risk-flags — rule-based risk flags derived from live data (RLS).
 * Currently flags arrears (2+ overdue unpaid weeks). AI-detected safeguarding
 * concerns can be layered on later via /api/ai/task; this gives a real,
 * deterministic signal without a dedicated table.
 */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);

  const { data: tenants } = await auth.supabase
    .from("tenants")
    .select("id, full_name, room_number")
    .eq("is_active", true)
    .eq("is_archived", false);

  const { data: charges } = await auth.supabase
    .from("service_charges")
    .select("tenant_id, is_paid, due_date");

  const overdueByTenant = new Map<string, number>();
  for (const c of charges ?? []) {
    if (!c.is_paid && (c.due_date as string) < today) {
      overdueByTenant.set(c.tenant_id as string, (overdueByTenant.get(c.tenant_id as string) ?? 0) + 1);
    }
  }

  const flags = (tenants ?? [])
    .map((t) => {
      const weeks = overdueByTenant.get(t.id as string) ?? 0;
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
}
