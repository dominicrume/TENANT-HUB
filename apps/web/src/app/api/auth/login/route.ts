import { NextResponse } from "next/server";
import { db, hasDatabaseUrl, findProfileByEmail, setPasswordHash, createSession, recordLoginAttempt, recentFailedAttempts, isLoginThrottled, getMfaState, createMfaChallenge } from "@tenant-hub/db";
import { verifyPassword, hashPassword, generateToken, hashToken } from "@tenant-hub/auth";
import { isSameOriginPost } from "../../../../lib/csrf";
import { setSessionCookie } from "../../../../lib/session-cookie";

/**
 * POST /api/auth/login — Tenant Hub's own login (BUILD_PLAN C31). Supabase
 * Auth's /login flow still exists and still works; this is the new path,
 * built and proven before anything is cut over to it.
 *
 * Every attempt is recorded (login_attempts) before the throttle check even
 * runs on the NEXT attempt — so a person locked out sees a plain "too many
 * attempts" message, never a hint about whether the account exists.
 */
export async function POST(req: Request) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  if (!hasDatabaseUrl()) return NextResponse.json({ error: "Own-session login is not configured on this environment yet" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return NextResponse.json({ error: "Email and password are required" }, { status: 422 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  const client = db();

  const failures = await recentFailedAttempts(client, { email, ip });
  if (isLoginThrottled(failures)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  const profile = await findProfileByEmail(client, email);
  const result = await verifyPassword(password, profile?.password_hash ?? null);

  await recordLoginAttempt(client, { email, ip, succeeded: result.valid });

  if (!profile || !result.valid) {
    return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  if (result.needsRehash) {
    await setPasswordHash(client, profile.id, await hashPassword(password));
  }

  // MFA (migration 052): password alone doesn't open a session for an
  // account with an authenticator enrolled. Hand back a short-lived challenge
  // and let /api/auth/mfa/verify finish the job. The attempt above is already
  // recorded as a success — the password WAS right; the throttle is for guessing.
  const mfa = await getMfaState(client, profile.id);
  if (mfa.enabled) {
    const challenge = generateToken();
    await createMfaChallenge(client, { profileId: profile.id, tokenHash: hashToken(challenge) });
    return NextResponse.json({ mfaRequired: true, challenge });
  }

  const token = generateToken();
  await createSession(client, { profileId: profile.id, tokenHash: hashToken(token), ip, userAgent: req.headers.get("user-agent") });
  setSessionCookie(token);

  return NextResponse.json({ id: profile.id, email: profile.email, role: profile.role, fullName: profile.full_name });
}
