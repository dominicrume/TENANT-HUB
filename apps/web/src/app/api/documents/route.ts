import { NextResponse } from "next/server";
import { getApiAuth } from "../../../lib/api-auth";

export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const { data, error } = await auth.supabase
    .from("tenant_documents")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !body.tenant_id || !body.name || !body.file_url) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
  }

  const { data, error } = await auth.supabase
    .from("tenant_documents")
    .insert({
      tenant_id: body.tenant_id,
      name: body.name,
      file_url: body.file_url,
      uploaded_by: auth.actor.user_name
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
