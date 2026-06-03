import { NextResponse } from "next/server";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../lib/api-auth";

/** GET /api/profiles — staff list (managers only; RLS also applies). */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (auth.actor.user_role !== "manager") {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { data, error } = await auth.supabase
    .from("profiles")
    .select("id, full_name, role, email, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
