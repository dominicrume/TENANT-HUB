import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { getApiAuth } from "../../../../../lib/api-auth";
import { can } from "@tenant-hub/auth";
import { toSafeErrorMessage } from "../../../../../lib/safe-error";

interface Params {
  params: { id: string };
}

interface TenantFormRow {
  id: string;
  tenant_id: string;
  template_id: string;
  data: unknown;
  status: string;
  created_at: string;
  updated_at: string;
  tpl_id: string;
  tpl_org_id: string;
  tpl_name: string;
  tpl_key: string;
  tpl_schema: unknown;
  tpl_created_at: string;
}

/**
 * GET /api/tenants/[id]/forms — fetch all filled forms for a tenant. Scoped
 * by org_id via the tenant (tenant_forms itself has no org_id column — RLS
 * used to scope it through tenants.org_id, replicated here as an explicit
 * JOIN). The nested `template:form_templates(*)` select is a JOIN, reshaped
 * back into the same { ...form, template: {...} } shape the frontend expects.
 */
export async function GET(_req: Request, { params }: Params) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "tenants", "read")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  if (!auth.actor.org_id) return NextResponse.json({ error: "Tenant not found or access denied" }, { status: 404 });

  try {
    const tenantCheck = await db().query("SELECT id FROM tenants WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id]);
    if (!tenantCheck.rows[0]) return NextResponse.json({ error: "Tenant not found or access denied" }, { status: 404 });

    const r = await db().query<TenantFormRow>(
      `SELECT tf.id, tf.tenant_id, tf.template_id, tf.data, tf.status, tf.created_at, tf.updated_at,
              ft.id AS tpl_id, ft.org_id AS tpl_org_id, ft.name AS tpl_name, ft.key AS tpl_key, ft.schema AS tpl_schema, ft.created_at AS tpl_created_at
         FROM tenant_forms tf
         JOIN form_templates ft ON ft.id = tf.template_id
        WHERE tf.tenant_id = $1`,
      [params.id],
    );

    const data = r.rows.map(({ tpl_id, tpl_org_id, tpl_name, tpl_key, tpl_schema, tpl_created_at, ...rest }) => ({
      ...rest,
      template: { id: tpl_id, org_id: tpl_org_id, name: tpl_name, key: tpl_key, schema: tpl_schema, created_at: tpl_created_at },
    }));

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

/**
 * POST /api/tenants/[id]/forms — upsert data for a specific form template.
 * Writes through writeWithAudit (H1) instead of a raw Supabase upsert: the
 * unique (tenant_id, template_id) row is looked up first so an existing row
 * is updated rather than duplicated.
 */
export async function POST(req: Request, { params }: Params) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "tenants", "update")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  if (!auth.actor.org_id) return NextResponse.json({ error: "Tenant not found or access denied" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || !body.template_id || !body.data) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
  }

  try {
    const tenantCheck = await db().query("SELECT id FROM tenants WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id]);
    if (!tenantCheck.rows[0]) return NextResponse.json({ error: "Tenant not found or access denied" }, { status: 404 });

    const existing = await db().query<{ id: string }>(
      "SELECT id FROM tenant_forms WHERE tenant_id = $1 AND template_id = $2",
      [params.id, body.template_id],
    );

    const record: Record<string, unknown> = {
      tenant_id: params.id,
      template_id: body.template_id,
      data: body.data,
      status: body.status || "draft",
    };
    if (existing.rows[0]) record.id = existing.rows[0].id;

    const { data } = await writeWithAudit({
      table: "tenant_forms",
      record,
      action: existing.rows[0] ? "UPDATE" : "CREATE",
      tenant_id: params.id,
      ...auth.actor,
    });

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
