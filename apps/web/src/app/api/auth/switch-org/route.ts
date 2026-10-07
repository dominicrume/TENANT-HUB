import { NextResponse } from "next/server";
import { db, switchActiveOrg } from "@tenant-hub/db";
import { hashToken } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../lib/api-auth";
import { isSameOriginPost } from "../../../../lib/csrf";
import { readSessionToken } from "../../../../lib/session-cookie";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/switch-org — sets which organisation THIS SESSION is
 * active in (migration 046). Body: { orgId }. Verifies the profile is
 * actually a member (own org_id or an explicit grant) before switching —
 * never trusts the orgId blindly. The next getApiAuth() call anywhere
 * picks up the new org automatically; no other route needs to know this
 * endpoint exists.
 */
export async function POST(req: Request) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });

  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const token = readSessionToken();
  if (!token) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const orgId = typeof body?.orgId === "string" ? body.orgId : "";
  if (!orgId) return NextResponse.json({ error: "orgId is required" }, { status: 422 });

  try {
    const ok = await switchActiveOrg(db(), { tokenHash: hashToken(token), profileId: auth.actor.user_id, orgId });
    if (!ok) return NextResponse.json({ error: "You don't have access to that organisation" }, { status: 403 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[auth/switch-org:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
