import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { getApiAuth } from "../../../../lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ duplicates: {} });

  const body = await req.json().catch(() => ({}));
  const nino = body.nino?.trim();
  const mobile = body.mobile?.trim();

  const duplicates: Record<string, string> = {};

  if (nino) {
    const r = await db().query<{ id: string; first_name: string | null; last_name: string | null }>(
      "SELECT id, first_name, last_name FROM tenants WHERE org_id = $1 AND nino = $2 LIMIT 1", [auth.actor.org_id, nino]);
    const existingNino = r.rows[0];
    if (existingNino) {
      duplicates.nino = `Duplicate NINO: already exists for tenant ${existingNino.first_name || ""} ${existingNino.last_name || ""}`;
    }
  }

  if (mobile) {
    const r = await db().query<{ id: string; first_name: string | null; last_name: string | null }>(
      "SELECT id, first_name, last_name FROM tenants WHERE org_id = $1 AND mobile = $2 LIMIT 1", [auth.actor.org_id, mobile]);
    const existingMobile = r.rows[0];
    if (existingMobile) {
      duplicates.mobile = `Duplicate phone number: already exists for tenant ${existingMobile.first_name || ""} ${existingMobile.last_name || ""}`;
    }
  }

  return NextResponse.json({ duplicates });
}
