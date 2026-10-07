import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { getApiAuth } from "../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../lib/safe-error";

/**
 * GET /api/staff-notes?tenantId=[id] — staff notes for the org, optionally
 * filtered by tenant. staff_notes carries org_id directly; the nested
 * `tenant:tenants(full_name)` select becomes an explicit LEFT JOIN, reshaped
 * back into the same { tenant: { full_name } } shape the frontend expects.
 */
export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json([]);

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");

  try {
    const params: unknown[] = [auth.actor.org_id];
    let sql = `SELECT sn.*, t.full_name AS tenant_full_name
               FROM staff_notes sn
               LEFT JOIN tenants t ON t.id = sn.tenant_id
               WHERE sn.org_id = $1`;
    if (tenantId) {
      params.push(tenantId);
      sql += ` AND sn.tenant_id = $${params.length}`;
    }
    sql += ` ORDER BY sn.created_at DESC`;

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

/** POST /api/staff-notes — create a staff note via writeWithAudit (H1). */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || !body.note_content) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
  }

  try {
    const { data } = await writeWithAudit({
      table: "staff_notes",
      record: {
        org_id: auth.actor.org_id,
        tenant_id: body.tenant_id || null,
        author_name: auth.actor.user_name,
        note_content: body.note_content,
      } as Record<string, unknown>,
      action: "CREATE",
      tenant_id: body.tenant_id || undefined,
      ...auth.actor,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
