import { NextResponse } from "next/server";
import { db, hasDatabaseUrl, findProfileByEmail, createPasswordReset } from "@tenant-hub/db";
import { generateToken, hashToken } from "@tenant-hub/auth";
import { notifier } from "@tenant-hub/adapters";
import { env } from "@tenant-hub/env";
import { isSameOriginPost } from "../../../../../lib/csrf";

/**
 * POST /api/auth/password/reset-request — always answers the same way,
 * whether or not the email matches an account: a person trying to find out
 * who else uses this system doesn't get an answer from this endpoint's
 * response, only from whether an email actually arrives.
 */
export async function POST(req: Request) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  if (!hasDatabaseUrl()) return NextResponse.json({ error: "Not configured on this environment yet" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 422 });

  const client = db();
  const profile = await findProfileByEmail(client, email);
  if (profile) {
    const token = generateToken();
    await createPasswordReset(client, { profileId: profile.id, tokenHash: hashToken(token) });
    const base = env.server.APP_URL ?? new URL(req.url).origin;
    await notifier().send({
      to: profile.email, channel: "email", subject: "Reset your Tenant Hub password",
      body: `Follow this link within the hour to set a new password:\n\n${base}/reset-password/${token}\n\nIf you didn't ask for this, you can ignore it — nothing changes until the link is used.`,
    });
  }

  return NextResponse.json({ ok: true });
}
