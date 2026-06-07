import { NextResponse } from "next/server";
import { getApiAuth } from "../../../../lib/api-auth";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Missing body" }, { status: 422 });
  }

  // Allow updating status and assigned_to
  const updates: Record<string, any> = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("maintenance_tickets")
    .update(updates)
    .eq("id", params.id)
    .eq("org_id", auth.actor.org_id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
