import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@tenant-hub/env";
import { db, findProfileByEmail, createSession, recordLoginAttempt } from "@tenant-hub/db";
import { generateToken, hashToken } from "@tenant-hub/auth";
import { setSessionCookie } from "../../../../../lib/session-cookie";
import { STATE_COOKIE, publicOrigin } from "../../../../../lib/google-oauth";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google/callback — Google sends the person back here. Verify
 * the one-shot state, swap the code for tokens, read the verified email,
 * and sign them into THEIR EXISTING profile with the same session the
 * password login creates. No profile for that email = no account (invite-
 * only, unchanged): they're told to ask a manager for an invite. Nothing is
 * ever created from a Google login.
 */
export async function GET(req: Request) {
  const origin = publicOrigin(req);
  const fail = (msg: string) => NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);
  const clientId = env.server.GOOGLE_OAUTH_CLIENT_ID, clientSecret = env.server.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail("Sign in with Google isn't set up yet.");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = cookies().get(STATE_COOKIE)?.value;
  cookies().set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  if (!code || !state || !expected || state !== expected) return fail("That Google sign-in didn't complete. Try again.");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: `${origin}/api/auth/google/callback`, grant_type: "authorization_code" }),
  }).catch(() => null);
  const tokens = tokenRes && tokenRes.ok ? ((await tokenRes.json().catch(() => null)) as { access_token?: string } | null) : null;
  if (!tokens?.access_token) return fail("Google didn't accept that sign-in. Try again.");

  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } }).catch(() => null);
  const info = infoRes && infoRes.ok ? ((await infoRes.json().catch(() => null)) as { email?: string; email_verified?: boolean } | null) : null;
  const email = info?.email?.trim().toLowerCase();
  if (!email || info?.email_verified === false) return fail("Google couldn't confirm that email address.");

  const ip = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
  const profile = await findProfileByEmail(db(), email);
  await recordLoginAttempt(db(), { email, ip, succeeded: Boolean(profile) }).catch(() => {});
  if (!profile) return fail(`There's no Tenant Hub account for ${email}. Ask a manager to send you an invite.`);

  const token = generateToken();
  await createSession(db(), { profileId: profile.id, tokenHash: hashToken(token), ip, userAgent: req.headers.get("user-agent") });
  setSessionCookie(token);
  return NextResponse.redirect(`${origin}/choose-workspace`);
}
