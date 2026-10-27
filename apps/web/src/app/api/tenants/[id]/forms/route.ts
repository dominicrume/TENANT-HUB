import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { getApiAuth } from "../../../../../lib/api-auth";
import { can } from "@tenant-hub/auth";
import { toSafeErrorMessage } from "../../../../../lib/safe-error";
import { isTenantInScope } from "../../../../../lib/landlord-scope";

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
    // Landlord-scope: if a landlord is active, this tenant must be in its portfolio.
    const inScope = await isTenantInScope((sql, p) => db().query(sql, p), auth, params.id);
    if (!inScope) return NextResponse.json({ error: "Tenant not found or access denied" }, { status: 404 });

    const r = await db().query<TenantFormRow>(
      `SELECT tf.id, tf.tenant_id, tf.template_id, tf.data, tf.status, tf.created_at, tf.updated_at,
              ft.id AS tpl_id, ft.org_id AS tpl_org_id, ft.name AS tpl_name, ft.key AS tpl_key, ft.schema AS tpl_schema, ft.created_at AS tpl_created_at
         FROM tenant_forms tf
         JOIN form_templates ft ON ft.id = tf.template_id
        WHERE tf.tenant_id = $1`,
      [params.id],
    );

    // The UI knows forms by their key ("reliance-support-plan"), the table by the template's UUID.
    // Hand back the key as template_id so every tab's `.find(f => f.template_id === key)` is true.
    const data = r.rows.map(({ tpl_id, tpl_org_id, tpl_name, tpl_key, tpl_schema, tpl_created_at, ...rest }) => ({
      ...rest, template_id: tpl_key, template_uuid: tpl_id,
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
    // Landlord-scope write guard: 404 (not 403) so a wrong-landlord URL poke reveals nothing.
    const inScope = await isTenantInScope((sql, p) => db().query(sql, p), auth, params.id);
    if (!inScope) return NextResponse.json({ error: "Tenant not found or access denied" }, { status: 404 });

    // template_id arrives as a key ("reliance-support-plan") or a UUID. A key resolves to this
    // organisation's template row, created on first use — the save must never fail because a
    // seed row is missing (2026-10-15: the table was empty in production and every plan save failed).
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(body.template_id));
    let templateId: string = String(body.template_id);
    if (!isUuid) {
      const key = String(body.template_id).trim().toLowerCase();
      const found = await db().query<{ id: string }>("SELECT id FROM form_templates WHERE org_id = $1 AND key = $2", [auth.actor.org_id, key]);
      if (found.rows[0]) templateId = found.rows[0].id;
      else {
        const name = key.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const { data: tpl } = await writeWithAudit({ table: "form_templates", record: { org_id: auth.actor.org_id, key, name, schema: {} } as Record<string, unknown>, action: "CREATE", ...auth.actor });
        templateId = String(((Array.isArray(tpl) ? tpl[0] : tpl) as Record<string, unknown>)["id"]);
      }
    }

    const existing = await db().query<{ id: string }>(
      "SELECT id FROM tenant_forms WHERE tenant_id = $1 AND template_id = $2",
      [params.id, templateId],
    );

    const record: Record<string, unknown> = {
      tenant_id: params.id,
      template_id: templateId,
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
