import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { getApiAuth } from "../../../lib/api-auth";
import type { AuditEntry } from "@tenant-hub/audit";

export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const brand = searchParams.get("brand");

  let query = auth.supabase.from("settings").select("*");
  if (brand) {
    query = query.eq("brand", brand);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json();
  const { id, service_charge_default } = body;
  
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const { data } = await writeWithAudit({
      table: "settings",
      record: { id, service_charge_default },
      action: "UPDATE" as AuditEntry["action"],
      user_id: auth.actor.user_id,
      user_name: auth.actor.user_name,
      user_role: auth.actor.user_role,
      entry_method: "manual"
    });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
