import { NextResponse } from "next/server";
import { db, getMfaState, findMfaChallenge, consumeMfaChallenge, consumeRecoveryCode, createSession, findProfileById } from "@tenant-hub/db";
import { verifyTotp, generateToken, hashToken } from "@tenant-hub/auth";
import { isSameOriginPost } from "../../../../../lib/csrf";
import { setSessionCookie } from "../../../../../lib/session-cookie";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/mfa/verify { challenge, code } — second half of a login
 * for an account with MFA on. The challenge was issued by /api/auth/login
 * after the password passed; it lives 5 minutes and is burned on success.
 * `code` is either a 6-digit app code or one recovery code ("xxxxx-xxxxx"),
 * which is spent on use. A wrong code leaves the challenge intact so a
 * mistyped digit doesn't send the person back to the password screen.
 */
export async function POST(req: Request) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { challenge?: string; code?: string } | null;
  const challenge = typeof body?.challenge === "string" ? body.challenge : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!challenge || !code) return NextResponse.json({ error: "Enter the code from your authenticator app" }, { status: 422 });

  const client = db();
  const challengeHash = hashToken(challenge);
  const found = await findMfaChallenge(client, challengeHash);
  if (!found) return NextResponse.json({ error: "This sign-in has expired. Start again from your password.", expired: true }, { status: 410 });

  const state = await getMfaState(client, found.profileId);
  if (!state.enabled || !state.secret) {
    // MFA was switched off between password and code — nothing left to check.
    await consumeMfaChallenge(client, challengeHash);
    return finish(req, client, found.profileId);
  }

  const isAppCode = /^\d{6}$/.test(code.replace(/\s+/g, ""));
  let passed = false;
  if (isAppCode) passed = verifyTotp(state.secret, code.replace(/\s+/g, ""));
  else passed = await consumeRecoveryCode(client, found.profileId, hashToken(code.toLowerCase()));
  if (!passed) return NextResponse.json({ error: "That code didn't match. Try again, or use a recovery code." }, { status: 401 });

  await consumeMfaChallenge(client, challengeHash);
  return finish(req, client, found.profileId);
}

async function finish(req: Request, client: ReturnType<typeof db>, profileId: string) {
  const profile = await findProfileById(client, profileId);
  if (!profile) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  const token = generateToken();
  await createSession(client, { profileId, tokenHash: hashToken(token), ip, userAgent: req.headers.get("user-agent") });
  setSessionCookie(token);
  return NextResponse.json({ id: profile.id, email: profile.email, role: profile.role, fullName: profile.full_name });
}
