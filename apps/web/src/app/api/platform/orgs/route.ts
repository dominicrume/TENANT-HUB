import { NextResponse } from "next/server";
import { db, hasDatabaseUrl } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../lib/api-handler";
import { isPlatformOwner } from "../../../../lib/user-admin";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/platform/orgs — every organisation on the platform with its
 * profiles. Platform-owner only. The permanent fix for the terminal-script
 * workflow (Rume, 2026-10-26) — this is what the /platform console reads.
 */
export const GET = withRouteHandler({ resource: "sessions", action: "read" }, async (_req, _ctx, auth) => {
  if (!isPlatformOwner(auth.actor)) return NextResponse.json({ error: "Only the platform owner can read this." }, { status: 403 });
  if (!hasDatabaseUrl()) return NextResponse.json({ orgs: [] });

  try {
    const r = await db().query<{ org_id: string | null; org_name: string | null; org_created_at: string | null; profile_id: string; email: string; full_name: string; role: string; created_at: string }>(
      `SELECT o.id AS org_id, o.name AS org_name, o.created_at AS org_created_at,
              p.id AS profile_id, p.email, p.full_name, p.role, p.created_at
         FROM profiles p LEFT JOIN organisations o ON o.id = p.org_id
        ORDER BY o.name NULLS LAST, p.full_name`
    );
    const byOrg = new Map<string, { id: string | null; name: string | null; createdAt: string | null; profiles: Array<{ id: string; email: string; fullName: string; role: string; createdAt: string }> }>();
    for (const row of r.rows) {
      const k = row.org_id ?? "null";
      let cur = byOrg.get(k);
      if (!cur) { cur = { id: row.org_id, name: row.org_name, createdAt: row.org_created_at, profiles: [] }; byOrg.set(k, cur); }
      cur.profiles.push({ id: row.profile_id, email: row.email, fullName: row.full_name, role: row.role, createdAt: row.created_at });
    }
    return NextResponse.json({ orgs: [...byOrg.values()] }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[platform/orgs:GET]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
