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

export async function DELETE(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing document id" }, { status: 400 });

  // 1. Fetch file_url to clean up storage
  const { data: doc } = await auth.supabase
    .from("tenant_documents")
    .select("file_url")
    .eq("id", id)
    .single();

  if (doc?.file_url) {
    await auth.supabase.storage.from("tenant-documents").remove([doc.file_url]);
  }

  // 2. Delete database record
  const { error } = await auth.supabase
    .from("tenant_documents")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
