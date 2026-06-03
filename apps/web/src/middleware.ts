import { NextRequest, NextResponse } from "next/server";

const PUBLIC = ["/login", "/signup", "/reset-password", "/intake/verify"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next();

  // Auth token check — wired to Supabase SSR in Sprint 1
  const token = req.cookies.get("sb-access-token");
  if (!token) return NextResponse.redirect(new URL("/login", req.url));

  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|favicon|api/health).*)"] };
