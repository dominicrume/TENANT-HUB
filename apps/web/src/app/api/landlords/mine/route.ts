import { NextResponse } from "next/server";
import { db, landlordsForProfile } from "@tenant-hub/db";
import { getApiAuth } from "../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/landlords/mine — every landlord this account can work for,
 * across every organisation it belongs to (migration 054). Feeds the
 * sign-in picker and the topbar switcher, so a landlord added internally is
 * available to choose the moment it's saved — no restart, no re-login.
 */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  try {
    return NextResponse.json(await landlordsForProfile(db(), auth.actor.user_id), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
