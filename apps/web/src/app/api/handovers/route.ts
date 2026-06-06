import { NextResponse } from "next/server";
import { getApiAuth } from "../../../../lib/api-auth";

export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const date = url.searchParams.get("date") || new Date().toISOString().split("T")[0];

  const { data, error } = await auth.supabase
    .from("shift_handovers")
    .select("*")
    .eq("shift_date", date)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !body.shift_type || !body.notes) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
  }

  const { data, error } = await auth.supabase
    .from("shift_handovers")
    .insert({
      org_id: auth.actor.org_id,
      shift_date: body.shift_date || new Date().toISOString().split("T")[0],
      shift_type: body.shift_type,
      notes: body.notes,
      staff_name: auth.actor.user_name
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
