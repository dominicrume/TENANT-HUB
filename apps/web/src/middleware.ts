import { NextRequest, NextResponse } from "next/server";
import { authRateLimit, aiRateLimit, genericRateLimit } from "./lib/rate-limit";

const PUBLIC_PREFIXES = [
  "/login",
  "/reset-password",
  "/invite",
  "/intake/verify",
  "/api/auth",
  "/api/health",
  // The wall-QR repair report — whoever scans the poster has no account (BUILD_PLAN C33).
  "/report",
  "/api/report",
];

interface VerifiedUser { id: string; email: string; role: string; orgId: string | null; tenantId: string | null; fullName: string }

/**
 * Who's signed in, per Tenant Hub's own sessions (BUILD_PLAN C31, cut over
 * 2026-10, DECISIONS D27). Middleware runs on the Edge runtime and can't hold
 * a raw Postgres connection itself, so it asks /api/auth/verify — an
 * ordinary Node-runtime route — and trusts its answer (D26's recommended
 * shape). The incoming request's own cookie header is forwarded so that
 * route sees the same session cookie middleware itself was just handed.
 */
async function getUser(req: NextRequest): Promise<VerifiedUser | null> {
  try {
    // Same fix as the CSRF same-origin check (DECISIONS D27 deploy):
    // req.url's host can reflect internal reverse-proxy plumbing rather than
    // the public hostname, so this fetch would silently fail behind Railway
    // and fall into the catch below — which, correctly, fails closed and
    // treats a verified session as "not signed in". Build the URL from the
    // Host/X-Forwarded-Host header instead, the one thing every reverse
    // proxy is obligated to forward correctly.
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const verifyUrl = host ? `${proto}://${host}/api/auth/verify` : new URL("/api/auth/verify", req.url).toString();
    const res = await fetch(verifyUrl, {
      headers: { cookie: req.headers.get("cookie") ?? "" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { user: VerifiedUser | null };
    return body.user;
  } catch {
    // Fails closed: a verify-call failure is treated as "not signed in",
    // never as "let them through".
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hostname = req.headers.get("host") || "";
  const res = NextResponse.next();

  const redirectWithCookies = (url: URL) => NextResponse.redirect(url);

  // Rate limiting for API routes. /api/auth/verify is deliberately exempt:
  // it isn't credential-guessable (it only reads a session cookie the
  // caller already holds), but getUser() below calls it on EVERY protected
  // page load, as a real HTTP request that re-enters this same middleware.
  // Moving it from the 10/min login-throttle bucket to the 200/min generic
  // one (first fix) only raised the ceiling, it didn't remove it — found
  // live on Railway, this container's own repeated internal self-calls
  // exhausted even that within one test session, self-rate-limiting every
  // page in the app back to /login with a perfectly valid session. Its
  // load scales with legitimate traffic, not attacker behaviour, so it
  // skips rate limiting entirely rather than sharing a bucket with anything.
  if (pathname.startsWith("/api/") && pathname !== "/api/auth/verify") {
    const ip = req.ip ?? req.headers.get("x-forwarded-for") ?? "127.0.0.1";
    try {
      let limitResult;
      if (pathname.startsWith("/api/auth/")) {
        limitResult = await authRateLimit.limit(ip);
      } else if (pathname.startsWith("/api/ai/")) {
        limitResult = await aiRateLimit.limit(ip);
      } else {
        limitResult = await genericRateLimit.limit(ip);
      }

      if (!limitResult.success) {
        return new NextResponse("Too many requests", { status: 429 });
      }
    } catch (e) {
      console.warn("Ratelimit error", e);
    }
  }

  const user = await getUser(req);
  const isPublic = pathname === "/" || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  // No session on a protected route → explicit redirect for HTML pages, 401 for API requests.
  if (!user && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return redirectWithCookies(new URL("/login", req.url));
  }

  // Signed-in user hitting the login page → send to the appropriate home.
  if (user && pathname.startsWith("/login")) {
    if (user.role === "tenant") {
      return redirectWithCookies(new URL("/my-home", req.url));
    }
    return redirectWithCookies(new URL("/dashboard", req.url));
  }

  // Attach the role so downstream RBAC checks don't re-query (parity with RLS).
  if (user) {
    res.headers.set("x-user-role", user.role);
    res.headers.set("x-user-id", user.id);
    if (user.tenantId) res.headers.set("x-tenant-id", user.tenantId);
    if (user.orgId) res.headers.set("x-org-id", user.orgId);

    // Contractor routing enforcement
    if (user.role === "contractor") {
      if (pathname === "/dashboard" || pathname.startsWith("/tenants")) {
        return redirectWithCookies(new URL("/jobs", req.url));
      }
    }

    // Tenant routing enforcement — confine to the tenant portal pages.
    if (user.role === "tenant") {
      // "/report" included so a tenant already signed in on their phone can still
      // use the wall-QR poster without being bounced back to /my-home (BUILD_PLAN C33).
      const TENANT_ALLOWED = ["/my-home", "/my-ledger", "/report-issue", "/report"];
      const isAllowed =
        TENANT_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
        pathname.startsWith("/api/") ||
        pathname.startsWith("/auth/");
      if (!isAllowed) {
        return redirectWithCookies(new URL("/my-home", req.url));
      }
    }
  }

  // Multi-tenant domain logic
  if (hostname) {
    const parts = hostname.split(".");
    if (parts.length >= 3 || (parts.length >= 2 && hostname.includes("localhost"))) {
      const subdomain = parts[0]?.toLowerCase();
      if (subdomain && subdomain !== "www" && subdomain !== "app") {
        res.headers.set("x-brand", subdomain);
      }
    }
  }

  return res;
}

export const config = {
  // Skip Next internals, the health check, static assets, and
  // api/auth/verify. That last one is load-bearing, not cosmetic: getUser()
  // above calls /api/auth/verify as a real HTTP request on every protected
  // page load, and without this exclusion THAT request would re-enter this
  // same middleware, call getUser() again, fetch /api/auth/verify again,
  // and so on — an unbounded server-side recursive loop with no base case.
  // Found live on Railway as what looked like total service hangs
  // (login, dashboard, even unrelated pages, all timing out with zero
  // server-side errors): this is what every one of those requests was
  // actually stuck in.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|api/auth/verify).*)"],
};
