import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { CHECKLIST_ITEMS } from "@tenant-hub/validation";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../lib/safe-error";

function defaultItems() {
  return Object.fromEntries(CHECKLIST_ITEMS.map((k) => [k, false]));
}

/** GET /api/intake-checklists?tenantId — existing row, or an unsaved default.
 * intake_checklists has no org_id column of its own (supabase/migrations/001)
 * — Supabase RLS scoped it via tenant_id -> tenants.org_id (migration 032's
 * visible_tenant_ids()), so that join replaces it here. */
export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const tenantId = new URL(req.url).searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });
  if (!auth.actor.org_id) return NextResponse.json({ id: null, tenant_id: tenantId, ...defaultItems() });

  try {
    const r = await db().query<Record<string, unknown>>(
      `SELECT ic.* FROM intake_checklists ic
       JOIN tenants t ON t.id = ic.tenant_id
       WHERE ic.tenant_id = $1 AND t.org_id = $2`,
      [tenantId, auth.actor.org_id],
    );
    return NextResponse.json(r.rows[0] ?? { id: null, tenant_id: tenantId, ...defaultItems() });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

/** POST /api/intake-checklists — create the checklist row for a tenant. */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "intake_checklists", "create")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body?.tenant_id) return NextResponse.json({ error: "tenant_id required" }, { status: 422 });

  try {
    const owned = await db().query<{ id: string }>(
      "SELECT id FROM tenants WHERE id = $1 AND org_id = $2",
      [body.tenant_id, auth.actor.org_id],
    );
    if (!owned.rows[0]) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const record: Record<string, unknown> = { tenant_id: body.tenant_id, ...defaultItems() };
    for (const k of CHECKLIST_ITEMS) if (k in body) record[k] = Boolean(body[k]);

    const { data } = await writeWithAudit({
      table: "intake_checklists",
      record,
      action: "CREATE",
      org_id: auth.actor.org_id,
      tenant_id: body.tenant_id,
      user_id: auth.actor.user_id,
      user_name: auth.actor.user_name,
      user_role: auth.actor.user_role,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = toSafeErrorMessage(err, "Unknown error");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
