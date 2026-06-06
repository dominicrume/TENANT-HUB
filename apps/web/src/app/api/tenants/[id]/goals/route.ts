import { NextResponse } from "next/server";
import { getApiAuth } from "../../../../../lib/api-auth";
import { can } from "@tenant-hub/auth";

interface Params {
  params: { id: string };
}

/** GET /api/tenants/[id]/goals — fetch goals for a tenant */
export async function GET(_req: Request, { params }: Params) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "tenants", "read")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { data, error } = await auth.supabase
    .from("tenant_goals")
    .select("*, tenant_goal_updates(*)")
    .eq("tenant_id", params.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** POST /api/tenants/[id]/goals — create a goal */
export async function POST(req: Request, { params }: Params) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "tenants", "update")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.area || !body.sub_category) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
  }

  // We write directly to tenant_goals via supabase standard client since
  // goals don't have a rigid blockchain audit requirement like the core tenant data.
  const { data, error } = await auth.supabase
    .from("tenant_goals")
    .insert({
      tenant_id: params.id,
      area: body.area,
      sub_category: body.sub_category,
      status: "active"
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Add initial update comment if provided
  if (body.initial_comment) {
    await auth.supabase
      .from("tenant_goal_updates")
      .insert({
        goal_id: data.id,
        comment: body.initial_comment,
        entered_by: auth.actor.user_id,
      });
  }

  return NextResponse.json(data, { status: 201 });
}
