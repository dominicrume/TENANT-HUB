import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { getApiAuth } from "../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../lib/safe-error";
import { emit } from "../../../lib/webhooks";
import { landlordScope, isTenantInScope } from "../../../lib/landlord-scope";

export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json([]);

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");

  try {
    const params: unknown[] = [auth.actor.org_id];
    let sql = `SELECT m.*, t.full_name AS tenant_full_name
               FROM maintenance_tickets m
               LEFT JOIN tenants t ON t.id = m.tenant_id
               WHERE m.org_id = $1`;
    if (tenantId) {
      params.push(tenantId);
      sql += ` AND m.tenant_id = $${params.length}`;
    }
    // Landlord-scope: tickets without a tenant can't be landlord-filtered. While
    // a landlord is active we filter by tenant_id → tenancies → properties.landlord_id
    // and drop the untied repairs — they belong to Tenant Hub-level view only.
    const scope = landlordScope(auth, "viaTenant", { col: "m.tenant_id", paramIndex: params.length + 1 });
    sql += scope.sql;
    params.push(...scope.params);
    sql += ` ORDER BY m.created_at DESC`;

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
  if (!body || !body.room_number || !body.issue_type || !body.description) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
  }

  // Landlord-scope write guard: when the body ties the ticket to a tenant, that
  // tenant must be in the active landlord's portfolio.
  if (body.tenant_id) {
    const ok = await isTenantInScope((sql, params) => db().query(sql, params), auth, body.tenant_id);
    if (!ok) return NextResponse.json({ error: "That tenant is not in your active landlord's portfolio." }, { status: 403 });
  }

  try {
    const { data } = await writeWithAudit({
      table: "maintenance_tickets",
      record: {
        org_id: auth.actor.org_id,
        tenant_id: body.tenant_id || null,
        room_number: body.room_number,
        issue_type: body.issue_type,
        description: body.description,
        status: body.status || "Open",
        reported_by: auth.actor.user_name,
        assigned_to: body.assigned_to || null,
        photo_url: body.photo_url || null,
      },
      action: "CREATE",
      org_id: auth.actor.org_id,
      user_id: auth.actor.user_id,
      user_name: auth.actor.user_name,
      user_role: auth.actor.user_role,
    });
    emit(auth.actor.org_id, "ticket.created", data as Record<string, unknown>);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
