import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { SessionCreateSchema } from "@tenant-hub/validation";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../lib/safe-error";

/**
 * GET /api/sessions?tenantId=[id]  — sessions for a tenant.
 * GET /api/sessions?thisWeek=true  — sessions created in the last 7 days.
 * sessions has no org_id of its own — scoped via its tenant (replacing what
 * Supabase RLS, org_sessions_read / visible_tenant_ids(), scoped implicitly).
 */
export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json([]);

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");
  const thisWeek = url.searchParams.get("thisWeek") === "true";

  try {
    const params: unknown[] = [auth.actor.org_id];
    let sql = `SELECT s.* FROM sessions s JOIN tenants t ON t.id = s.tenant_id WHERE t.org_id = $1`;
    if (tenantId) {
      params.push(tenantId);
      sql += ` AND s.tenant_id = $${params.length}`;
    }
    if (thisWeek) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      params.push(sevenDaysAgo);
      sql += ` AND s.created_at >= $${params.length}`;
    }
    sql += ` ORDER BY s.created_at DESC`;

    const r = await db().query(sql, params);
    return NextResponse.json(r.rows);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

/** POST /api/sessions — create a session via writeWithAudit (H1). */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "sessions", "create")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = SessionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const { data } = await writeWithAudit({
      table: "sessions",
      record: {
        ...parsed.data,
        entered_by: auth.actor.user_id,
        entered_by_name: auth.actor.user_name,
      } as Record<string, unknown>,
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
