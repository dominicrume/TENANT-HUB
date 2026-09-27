import { NextResponse } from "next/server";
import { db, hasDatabaseUrl, deleteSession } from "@tenant-hub/db";
import { hashToken } from "@tenant-hub/auth";
import { isSameOriginPost } from "../../../../lib/csrf";
import { readSessionToken, clearSessionCookie } from "../../../../lib/session-cookie";

/** POST /api/auth/logout — the own-session equivalent of /auth/signout. Clears the cookie regardless of whether a session was found, so a stale or already-expired cookie is never stuck in the browser. */
export async function POST(req: Request) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });

  const token = readSessionToken();
  if (token && hasDatabaseUrl()) await deleteSession(db(), hashToken(token));
  clearSessionCookie();

  return NextResponse.json({ ok: true });
}
