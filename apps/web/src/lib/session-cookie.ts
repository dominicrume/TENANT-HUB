/**
 * The cookie for Tenant Hub's own sessions (BUILD_PLAN C31) — separate from
 * Supabase Auth's own cookie, which still exists and still works while this
 * lands (docs/PLATFORM_CONSOLIDATION.md's strangling migration: build the new
 * path alongside the old one, cut over deliberately, never both at once by
 * accident). Only ever holds the raw session token; the hash of that token
 * is what's actually looked up in `user_sessions` (packages/db/src/
 * auth-store.ts) — the cookie itself proves nothing on its own.
 */
import { cookies } from "next/headers";
import { SESSION_TTL_MS } from "@tenant-hub/db";

export const SESSION_COOKIE = "th_session";

export function setSessionCookie(token: string, ttlMs: number = SESSION_TTL_MS): void {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ttlMs / 1000),
  });
}

export function readSessionToken(): string | null {
  return cookies().get(SESSION_COOKIE)?.value ?? null;
}

export function clearSessionCookie(): void {
  cookies().set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}
