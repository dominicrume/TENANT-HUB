import { NextResponse } from "next/server";
import { db, hasDatabaseUrl, findSessionByTokenHash } from "@tenant-hub/db";
import { hashToken } from "@tenant-hub/auth";
import { readSessionToken } from "../../../../lib/session-cookie";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/verify — the own-session cookie's only check (BUILD_PLAN
 * C31/D27). middleware.ts runs on the Edge runtime, which cannot hold a raw
 * Postgres connection the way `db()` needs — so instead of querying the
 * session table directly from middleware, middleware calls THIS route (a
 * normal Node-runtime API route, same as every other route in the app) and
 * trusts its answer. This is the D26-recommended shape, not a workaround.
 *
 * Called by middleware.ts (with the request's own cookies forwarded) and
 * directly by the client (AuthContext, on mount) — both just need the
 * answer to "who, if anyone, does this cookie belong to".
 */
export async function GET(req: Request) {
  if (!hasDatabaseUrl()) return NextResponse.json({ user: null }, { status: 200 });

  const token = readSessionToken();
  if (!token) return NextResponse.json({ user: null }, { status: 200 });

  const session = await findSessionByTokenHash(db(), hashToken(token)).catch(() => null);
  if (!session) return NextResponse.json({ user: null }, { status: 200 });

  return NextResponse.json({
    user: { id: session.profileId, email: session.email, role: session.role, orgId: session.orgId, orgName: session.orgName, tenantId: session.tenantId, fullName: session.fullName,
      landlordId: session.landlordId, landlordName: session.landlordName },
  });
}
