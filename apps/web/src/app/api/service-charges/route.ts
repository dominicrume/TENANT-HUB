import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { ServiceChargeCreateSchema } from "@tenant-hub/validation";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../lib/safe-error";
import { landlordScope, isTenantInScope } from "../../../lib/landlord-scope";

/**
 * GET /api/service-charges?tenantId=[id]  — charges for a tenant.
 * GET /api/service-charges?unpaid=true     — unpaid charges (dashboard total).
 *
 * service_charges has no org_id column of its own — org scoping goes through
 * tenant_id IN (SELECT id FROM tenants WHERE org_id = ...), replicating the
 * "org_rent_payments_read"-style RLS policy Supabase used to enforce.
 */
export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json([]);

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");
  const unpaid = url.searchParams.get("unpaid") === "true";

  const params: unknown[] = [auth.actor.org_id];
  let sql = "SELECT * FROM service_charges WHERE tenant_id IN (SELECT id FROM tenants WHERE org_id = $1)";
  if (tenantId) {
    params.push(tenantId);
    sql += ` AND tenant_id = $${params.length}`;
  }
  if (unpaid) sql += " AND is_paid = false";
  // Landlord-scope: restrict to tenants in the active landlord's portfolio.
  const scope = landlordScope(auth, "viaTenant", { col: "tenant_id", paramIndex: params.length + 1 });
  sql += scope.sql;
  params.push(...scope.params);
  sql += " ORDER BY due_date ASC";

  try {
    const r = await db().query(sql, params);
    return NextResponse.json(r.rows);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

/** POST /api/service-charges — add a charge week (writeWithAudit, H1). */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "service_charges", "create")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = ServiceChargeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  // Landlord-scope write guard: refuse to create a charge against a tenant outside the active landlord's portfolio.
  const inScope = await isTenantInScope((sql, p) => db().query(sql, p), auth, parsed.data.tenant_id);
  if (!inScope) return NextResponse.json({ error: "That tenant is not in your active landlord's portfolio." }, { status: 403 });

  try {
    const { data } = await writeWithAudit({
      table: "service_charges",
      record: { ...parsed.data, entered_by: auth.actor.user_id } as Record<string, unknown>,
      action: "CREATE",
      tenant_id: parsed.data.tenant_id,
      ...auth.actor,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = toSafeErrorMessage(err, "Unknown error");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
