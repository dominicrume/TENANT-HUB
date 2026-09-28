import { NextResponse } from "next/server";
import { db, hasDatabaseUrl, acceptInvite, createSession } from "@tenant-hub/db";
import { hashPassword, generateToken, hashToken } from "@tenant-hub/auth";
import { isSameOriginPost } from "../../../../../lib/csrf";
import { setSessionCookie } from "../../../../../lib/session-cookie";

/** POST /api/auth/invite/accept — spends the invite link, creates the account, and signs the new person straight in. */
export async function POST(req: Request) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  if (!hasDatabaseUrl()) return NextResponse.json({ error: "Not configured on this environment yet" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!token || !password) return NextResponse.json({ error: "Token and password are required" }, { status: 422 });
  if (password.length < 10) return NextResponse.json({ error: "Password must be at least 10 characters" }, { status: 422 });

  const client = db();
  let accepted;
  try {
    accepted = await acceptInvite(client, { tokenHash: hashToken(token), passwordHash: await hashPassword(password) });
  } catch {
    return NextResponse.json({ error: "An account already exists for this email. Use 'Forgot password' instead." }, { status: 409 });
  }
  if (!accepted) return NextResponse.json({ error: "This invite link is invalid or has expired" }, { status: 400 });

  const session = generateToken();
  await createSession(client, { profileId: accepted.profileId, tokenHash: hashToken(session), ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: req.headers.get("user-agent") });
  setSessionCookie(session);
  return NextResponse.json({ ok: true, role: accepted.role });
}
