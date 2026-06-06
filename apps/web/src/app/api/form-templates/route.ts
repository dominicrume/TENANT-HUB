import { NextResponse } from "next/server";
import { getApiAuth } from "../../../../lib/api-auth";
import { can } from "@tenant-hub/auth";

/** GET /api/form-templates — fetch all templates for org */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Currently we just let any staff view the templates so they can render the UI
  const { data, error } = await auth.supabase
    .from("form_templates")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** POST /api/form-templates — create or update a template */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Only managers/admins can modify form schemas
  if (auth.actor.user_role !== "manager" && auth.actor.user_role !== "admin") {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.name || !body.key || !body.schema) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
  }

  // Upsert by org_id and key using the unique constraint
  const { data, error } = await auth.supabase
    .from("form_templates")
    .upsert({
      org_id: auth.actor.org_id,
      name: body.name,
      key: body.key,
      schema: body.schema
    }, { onConflict: "org_id, key" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 200 });
}
