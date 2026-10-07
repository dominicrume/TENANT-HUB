import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { getApiAuth } from "../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../lib/safe-error";

/**
 * GET /api/reports?tenantId=[id]&month=YYYY-MM
 * Returns the tenant plus their sessions and service charges for that month,
 * for the monthly council support report. Read-only; org_id scoping replaces
 * what Supabase RLS did implicitly (the tenant row directly, sessions and
 * service_charges via tenant_id since neither table has its own org_id).
 */
export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");
  const month = url.searchParams.get("month"); // YYYY-MM
  if (!tenantId || !month) {
    return NextResponse.json({ error: "tenantId and month required" }, { status: 400 });
  }
  if (!auth.actor.org_id) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  const orgId = auth.actor.org_id;

  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y! + 1}-01-01` : `${y}-${String(m! + 1).padStart(2, "0")}-01`;

  try {
    const tenantR = await db().query<Record<string, unknown>>(
      "SELECT * FROM tenants WHERE id = $1 AND org_id = $2", [tenantId, orgId]);
    const tenant = tenantR.rows[0];
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const [sessions, charges] = await Promise.all([
      db().query<Record<string, unknown>>(
        `SELECT s.* FROM sessions s
         WHERE s.tenant_id = $1 AND s.session_date >= $2 AND s.session_date < $3
         ORDER BY s.session_date ASC`,
        [tenantId, start, next]),
      db().query<Record<string, unknown>>(
        `SELECT sc.* FROM service_charges sc
         WHERE sc.tenant_id = $1 AND sc.due_date >= $2 AND sc.due_date < $3
         ORDER BY sc.due_date ASC`,
        [tenantId, start, next]),
    ]);

    return NextResponse.json({ tenant, sessions: sessions.rows, charges: charges.rows });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
