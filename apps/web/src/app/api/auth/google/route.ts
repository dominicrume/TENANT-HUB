import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { env } from "@tenant-hub/env";
import { STATE_COOKIE, publicOrigin } from "../../../../lib/google-oauth";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google — start "Sign in with Google".
 *   ?status=1 → { enabled } so the login page shows the button only when
 *   GOOGLE_OAUTH_CLIENT_ID/SECRET exist (DECISIONS D27 dropped Supabase Auth
 *   and the Google sign-in it provided; this is that sign-in, rebuilt on our
 *   own sessions). Otherwise: redirect to Google with a one-shot state
 *   cookie; /api/auth/google/callback finishes it. Invite-only is preserved
 *   there — Google only signs in an email that already has a profile.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const enabled = Boolean(env.server.GOOGLE_OAUTH_CLIENT_ID && env.server.GOOGLE_OAUTH_CLIENT_SECRET);
  if (url.searchParams.get("status") === "1") return NextResponse.json({ enabled });
  if (!enabled) return NextResponse.redirect(`${publicOrigin(req)}/login?error=${encodeURIComponent("Sign in with Google isn't set up yet.")}`);

  const state = randomBytes(24).toString("hex");
  cookies().set(STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });

  const params = new URLSearchParams({
    client_id: env.server.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: `${publicOrigin(req)}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
