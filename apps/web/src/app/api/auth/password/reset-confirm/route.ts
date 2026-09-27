import { NextResponse } from "next/server";
import { db, hasDatabaseUrl, consumePasswordReset, setPasswordHash, deleteAllSessionsForProfile } from "@tenant-hub/db";
import { hashPassword, hashToken } from "@tenant-hub/auth";
import { isSameOriginPost } from "../../../../../lib/csrf";

/**
 * POST /api/auth/password/reset-confirm — spends the one-time token from the
 * emailed link. Every other session for this person is deleted in the same
 * step (packages/db's deleteAllSessionsForProfile) — a password reset is
 * usually a response to "someone else might have this", so an old session
 * surviving the reset would defeat the point of it.
 */
export async function POST(req: Request) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  if (!hasDatabaseUrl()) return NextResponse.json({ error: "Not configured on this environment yet" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!token || !password) return NextResponse.json({ error: "Token and new password are required" }, { status: 422 });
  if (password.length < 10) return NextResponse.json({ error: "Password must be at least 10 characters" }, { status: 422 });

  const client = db();
  const claimed = await consumePasswordReset(client, hashToken(token));
  if (!claimed) return NextResponse.json({ error: "This reset link is invalid or has expired" }, { status: 400 });

  await setPasswordHash(client, claimed.profileId, await hashPassword(password));
  await deleteAllSessionsForProfile(client, claimed.profileId);

  return NextResponse.json({ ok: true });
}
