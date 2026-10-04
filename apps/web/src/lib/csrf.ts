/**
 * Cross-site POST refusal for the own-session auth routes (BUILD_PLAN C31).
 * The session cookie is already SameSite=Lax, which browsers withhold on a
 * cross-site POST — this is defence in depth on top of that, an explicit
 * check rather than relying on cookie behaviour alone: a POST whose Origin
 * header doesn't match this app's own host is refused outright, before any
 * password or token is even looked at.
 *
 * Compares against the Host header (falling back to X-Forwarded-Host), NOT
 * `req.url`'s own host — found refusing every login on Railway (D27's
 * deployment) even with a correct Origin header: behind a reverse proxy,
 * what Next.js reconstructs as the request's own URL can reflect internal
 * proxy plumbing rather than the public hostname a browser actually sent the
 * request to. The Host header is the one thing every reverse proxy (Vercel's
 * included — it just happened to never expose this gap) is obligated to
 * forward correctly, so it's the reliable side of this comparison.
 */
export function isSameOriginPost(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin requests from older browsers/tools may omit it; the cookie's SameSite still protects them
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
