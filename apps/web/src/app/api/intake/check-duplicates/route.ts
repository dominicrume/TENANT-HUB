import { NextResponse } from "next/server";
import { getApiAuth } from "../../../../lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const nino = body.nino?.trim();
  const mobile = body.mobile?.trim();

  const duplicates: Record<string, string> = {};

  if (nino) {
    const { data: existingNino } = await auth.supabase
      .from("tenants")
      .select("id, first_name, last_name")
      .eq("org_id", auth.actor.org_id!)
      .eq("nino", nino)
      .limit(1);

    if (existingNino && existingNino.length > 0) {
      duplicates.nino = `Duplicate NINO: already exists for tenant ${existingNino[0]?.first_name || ""} ${existingNino[0]?.last_name || ""}`;
    }
  }

  if (mobile) {
    const { data: existingMobile } = await auth.supabase
      .from("tenants")
      .select("id, first_name, last_name")
      .eq("org_id", auth.actor.org_id!)
      .eq("mobile", mobile)
      .limit(1);

    if (existingMobile && existingMobile.length > 0) {
      duplicates.mobile = `Duplicate phone number: already exists for tenant ${existingMobile[0]?.first_name || ""} ${existingMobile[0]?.last_name || ""}`;
    }
  }

  return NextResponse.json({ duplicates });
}
