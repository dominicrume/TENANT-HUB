import { NextResponse } from "next/server";
import { db, getMfaState, disableTotp, consumeRecoveryCode } from "@tenant-hub/db";
import { verifyTotp, hashToken } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../../lib/api-auth";
import { isSameOriginPost } from "../../../../../lib/csrf";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/mfa/disable { code } — turning MFA off needs a current code
 * (or a recovery code), not just a live session: a stolen laptop with the
 * app open must not be enough to remove the second factor.
 */
export async function POST(req: Request) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { code?: string } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const state = await getMfaState(db(), auth.actor.user_id);
  if (!state.enabled || !state.secret) {
    await disableTotp(db(), auth.actor.user_id); // clears any half-finished enrolment too
    return NextResponse.json({ enabled: false });
  }
  const ok = /^\d{6}$/.test(code) ? verifyTotp(state.secret, code) : await consumeRecoveryCode(db(), auth.actor.user_id, hashToken(code.toLowerCase()));
  if (!ok) return NextResponse.json({ error: "That code didn't match." }, { status: 401 });
  await disableTotp(db(), auth.actor.user_id);
  return NextResponse.json({ enabled: false });
}
