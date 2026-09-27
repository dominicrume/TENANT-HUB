/**
 * Cross-site POST refusal for the own-session auth routes (BUILD_PLAN C31).
 * The session cookie is already SameSite=Lax, which browsers withhold on a
 * cross-site POST — this is defence in depth on top of that, an explicit
 * check rather than relying on cookie behaviour alone: a POST whose Origin
 * header doesn't match this app's own origin is refused outright, before any
 * password or token is even looked at.
 */
export function isSameOriginPost(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin requests from older browsers/tools may omit it; the cookie's SameSite still protects them
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}
