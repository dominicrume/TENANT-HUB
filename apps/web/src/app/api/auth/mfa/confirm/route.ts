import { NextResponse } from "next/server";
import { db, getMfaState, enableTotp } from "@tenant-hub/db";
import { verifyTotp, generateRecoveryCodes, hashToken } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../../lib/api-auth";
import { isSameOriginPost } from "../../../../../lib/csrf";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/mfa/confirm { code } — the app produced a valid code from
 * the pending secret, so MFA goes live and the recovery codes are returned
 * ONCE (only their hashes are kept). From the next login on, a password
 * alone is not enough for this account.
 */
export async function POST(req: Request) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { code?: string } | null;
  const state = await getMfaState(db(), auth.actor.user_id);
  if (!state.pendingSecret) return NextResponse.json({ error: "Start the set-up first" }, { status: 409 });
  if (!verifyTotp(state.pendingSecret, body?.code ?? "")) return NextResponse.json({ error: "That code didn't match. Check the app and try again." }, { status: 401 });

  const codes = generateRecoveryCodes();
  await enableTotp(db(), auth.actor.user_id, codes.map(hashToken));
  return NextResponse.json({ enabled: true, recoveryCodes: codes });
}
