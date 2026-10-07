import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { getApiAuth } from "../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../lib/safe-error";

/**
 * GET /api/incidents — staff-facing. Scoped to the signed-in staff member's
 * own organisation (org_id); an empty org means an empty list, never every
 * org's incident reports.
 */
export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json([]);

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");

  try {
    const params: unknown[] = [auth.actor.org_id];
    let sql = `SELECT i.*, t.full_name AS tenant_full_name
               FROM incident_reports i
               LEFT JOIN tenants t ON t.id = i.tenant_id
               WHERE i.org_id = $1`;
    if (tenantId) {
      params.push(tenantId);
      sql += ` AND i.tenant_id = $${params.length}`;
    }
    sql += ` ORDER BY i.incident_date DESC`;

    const r = await db().query<Record<string, unknown>>(sql, params);
    const data = r.rows.map(({ tenant_full_name, ...rest }) => ({
      ...rest,
      tenant: tenant_full_name ? { full_name: tenant_full_name } : null,
    }));
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || !body.incident_type || !body.description) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
  }

  try {
    const { data } = await writeWithAudit({
      table: "incident_reports",
      record: {
        org_id: auth.actor.org_id,
        tenant_id: body.tenant_id || null,
        incident_type: body.incident_type,
        description: body.description,
        incident_date: body.incident_date || new Date().toISOString(),
        reported_by: auth.actor.user_name,
      } as Record<string, unknown>,
      action: "CREATE",
      org_id: auth.actor.org_id,
      tenant_id: body.tenant_id || undefined,
      user_id: auth.actor.user_id,
      user_name: auth.actor.user_name,
      user_role: auth.actor.user_role,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[incidents:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
