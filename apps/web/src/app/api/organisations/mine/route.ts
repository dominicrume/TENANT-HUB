import { NextResponse } from "next/server";
import { db, organisationsForProfile } from "@tenant-hub/db";
import { getApiAuth } from "../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/organisations/mine — every organisation this account can work
 * in (BUILD_PLAN: post-login workspace picker, migration 046). One row for
 * almost everyone (their own org); more than one only for a manager who's
 * been explicitly granted access to another.
 */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  try {
    const orgs = await organisationsForProfile(db(), auth.actor.user_id);
    return NextResponse.json(orgs);
  } catch (err) {
    console.error("[organisations/mine:GET]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
