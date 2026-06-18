import { NextResponse } from "next/server";
import { getApiAuth } from "../../../../lib/api-auth";

export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { error } = await auth.supabase.from("form_templates").upsert({
    id: "reliance-support-plan",
    org_id: auth.actor.org_id,
    name: "Reliance Pack: Support Plan",
    key: "reliance-support-plan",
    schema: [],
    created_by: auth.actor.user_id,
  }, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
