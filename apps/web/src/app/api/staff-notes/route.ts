import { NextResponse } from "next/server";
import { getApiAuth } from "../../../lib/api-auth";

export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");

  let query = auth.supabase
    .from("staff_notes")
    .select("*, tenant:tenants(full_name)")
    .eq("org_id", auth.actor.org_id)
    .order("created_at", { ascending: false });

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !body.note_content) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
  }

  const { data, error } = await auth.supabase
    .from("staff_notes")
    .insert({
      org_id: auth.actor.org_id,
      tenant_id: body.tenant_id || null,
      author_name: auth.actor.user_name,
      note_content: body.note_content
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
