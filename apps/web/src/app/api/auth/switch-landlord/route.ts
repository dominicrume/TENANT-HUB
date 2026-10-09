import { NextResponse } from "next/server";
import { db, switchActiveLandlord } from "@tenant-hub/db";
import { hashToken } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../lib/api-auth";
import { isSameOriginPost } from "../../../../lib/csrf";
import { readSessionToken } from "../../../../lib/session-cookie";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/switch-landlord { landlordId | null } — which landlord's
 * portfolio THIS SESSION is looking at (migration 054). The landlord's
 * organisation becomes the active one at the same time, so the person
 * picks once. Membership is verified; the id is never trusted blindly.
 */
export async function POST(req: Request) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const token = readSessionToken();
  if (!token) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { landlordId?: string | null } | null;
  const landlordId = typeof body?.landlordId === "string" && body.landlordId ? body.landlordId : null;
  try {
    const ok = await switchActiveLandlord(db(), { tokenHash: hashToken(token), profileId: auth.actor.user_id, landlordId });
    if (!ok) return NextResponse.json({ error: "You don't have access to that landlord" }, { status: 403 });
    return NextResponse.json({ success: true, landlordId });
  } catch (err) {
    console.error("[auth/switch-landlord:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
