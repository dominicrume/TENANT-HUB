import { NextResponse } from "next/server";
import { getApiAuth } from "../../../../lib/api-auth";
import { can } from "@tenant-hub/auth";

interface Params {
  params: { goalId: string };
}

/** POST /api/goals/[goalId]/updates — add a progress note to a goal */
export async function POST(req: Request, { params }: Params) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "tenants", "update")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.comment) {
    return NextResponse.json({ error: "Missing comment" }, { status: 422 });
  }

  const { data, error } = await auth.supabase
    .from("tenant_goal_updates")
    .insert({
      goal_id: params.goalId,
      comment: body.comment,
      entered_by: auth.actor.user_id,
    })
    .select("*, entered_by:users!entered_by(full_name, role)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  return NextResponse.json(data, { status: 201 });
}
