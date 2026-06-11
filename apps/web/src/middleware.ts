import { NextRequest, NextResponse } from "next/server";
import { createSupabaseMiddleware } from "./lib/supabase-middleware";
// import { ratelimit } from "./lib/rate-limit";

const PUBLIC_PREFIXES = ["/login", "/signup", "/reset-password", "/intake/verify"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const { supabase, res } = createSupabaseMiddleware(req);

  // Rate limiting for API routes - Disabled temporarily to fix 504
  /*
  if (pathname.startsWith("/api/")) {
    const ip = req.ip ?? req.headers.get("x-forwarded-for") ?? "127.0.0.1";
    try {
      const { success } = await ratelimit.limit(ip);
      if (!success) {
        return new NextResponse("Too many requests", { status: 429 });
      }
    } catch (e) {
      console.warn("Ratelimit error", e);
    }
  }
  */

  // getUser() validates the JWT with Supabase (getSession only decodes locally).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  // No session on a protected route → explicit redirect (fixes silent 401s).
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Signed-in user hitting an auth page → send to the appropriate home.
  if (user && (pathname.startsWith("/login") || pathname.startsWith("/signup"))) {
    // Peek at role to decide where to send them (avoid an extra query below).
    const { data: p } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const r = (p?.role as string) ?? "tenant";
    if (r === "tenant") {
      return NextResponse.redirect(new URL("/my-home", req.url));
    }
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Attach the role so downstream RBAC checks don't re-query (parity with RLS).
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, tenant_id")
      .eq("id", user.id)
      .single();
    
    const role = (profile?.role as string) ?? "tenant";
    const tenantId = (profile as Record<string, unknown> | null)?.tenant_id as string | null;
    res.headers.set("x-user-role", role);
    res.headers.set("x-user-id", user.id);
    if (tenantId) res.headers.set("x-tenant-id", tenantId);

    // Contractor routing enforcement
    if (role === "contractor") {
      if (pathname === "/dashboard" || pathname.startsWith("/tenants")) {
        return NextResponse.redirect(new URL("/jobs", req.url));
      }
    }

    // Tenant routing enforcement — confine to the tenant portal pages.
    if (role === "tenant") {
      const TENANT_ALLOWED = ["/my-home", "/my-ledger", "/report-issue"];
      const isAllowed =
        TENANT_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
        pathname.startsWith("/api/") ||
        pathname.startsWith("/auth/");
      if (!isAllowed) {
        return NextResponse.redirect(new URL("/my-home", req.url));
      }
    }
  }

  return res;
}

export const config = {
  // Skip Next internals, the health check, and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
