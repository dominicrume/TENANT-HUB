import { NextResponse } from "next/server";
import { getApiAuth } from "../../../../../lib/api-auth";
import { can } from "@tenant-hub/auth";

interface Params {
  params: { id: string };
}

/** GET /api/tenants/[id]/forms — fetch all filled forms for a tenant */
export async function GET(_req: Request, { params }: Params) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "tenants", "read")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { data, error } = await auth.supabase
    .from("tenant_forms")
    .select("*, template:form_templates(*)")
    .eq("tenant_id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** POST /api/tenants/[id]/forms — upsert data for a specific form template */
export async function POST(req: Request, { params }: Params) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "tenants", "update")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.template_id || !body.data) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
  }

  // Upsert the tenant form by tenant_id and template_id using unique constraint
  const { data, error } = await auth.supabase
    .from("tenant_forms")
    .upsert({
      tenant_id: params.id,
      template_id: body.template_id,
      data: body.data,
      status: body.status || "draft"
    }, { onConflict: "tenant_id, template_id" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 200 });
}
