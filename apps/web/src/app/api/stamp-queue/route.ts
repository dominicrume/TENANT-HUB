import { NextResponse } from "next/server";
import { getApiAuth } from "../../../lib/api-auth";

/** GET /api/stamp-queue — blockchain stamp outbox status (RLS). */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { data, error } = await auth.supabase
    .from("stamp_queue")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
