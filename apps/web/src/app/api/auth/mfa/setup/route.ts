import { NextResponse } from "next/server";
import { db, setPendingTotpSecret, getMfaState } from "@tenant-hub/db";
import { generateTotpSecret, totpUri } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../../lib/api-auth";
import { isSameOriginPost } from "../../../../../lib/csrf";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/mfa/setup — start enrolling an authenticator app. Issues a
 * fresh secret as PENDING: nothing changes at login until /confirm proves
 * the app produces a valid code (otherwise a typo locks you out of your
 * own account). GET returns whether MFA is on, for the Security tab.
 */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const s = await getMfaState(db(), auth.actor.user_id);
  return NextResponse.json({ enabled: s.enabled, recoveryCodesLeft: s.recoveryHashes.length });
}

export async function POST(req: Request) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const secret = generateTotpSecret();
  await setPendingTotpSecret(db(), auth.actor.user_id, secret);
  const email = (await db().query<{ email: string | null }>("SELECT email FROM profiles WHERE id = $1", [auth.actor.user_id])).rows[0]?.email ?? auth.actor.user_name;
  return NextResponse.json({ secret, uri: totpUri(secret, email ?? "account") });
}
