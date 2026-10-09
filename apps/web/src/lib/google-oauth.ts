/** Shared by /api/auth/google and its callback. Lives here because a Next route file may only export HTTP handlers. */
export const STATE_COOKIE = "th_oauth_state";

/** The public origin, from the proxy headers — same reasoning as lib/csrf.ts: req.url's host is internal plumbing behind Railway. */
export function publicOrigin(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
