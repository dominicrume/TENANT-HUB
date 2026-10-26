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
    // Pull profiles + their org, plus the most-recent session timestamp (last-signed-in).
    const r = await db().query<{ org_id: string | null; org_name: string | null; org_created_at: string | null; profile_id: string; email: string; full_name: string; role: string; created_at: string; last_sign_in: string | null }>(
      `SELECT o.id AS org_id, o.name AS org_name, o.created_at AS org_created_at,
              p.id AS profile_id, p.email, p.full_name, p.role, p.created_at,
              (SELECT max(s.created_at) FROM user_sessions s WHERE s.profile_id = p.id) AS last_sign_in
         FROM profiles p LEFT JOIN organisations o ON o.id = p.org_id
        ORDER BY o.name NULLS LAST, p.full_name`
    );
    // Per-org counts of tenants/properties/landlords — one query each; cheap.
    const [tenantCountsR, propertyCountsR, landlordCountsR] = await Promise.all([
      db().query<{ org_id: string; n: string }>("SELECT org_id, count(*)::int AS n FROM tenants WHERE org_id IS NOT NULL GROUP BY org_id"),
      db().query<{ org_id: string; n: string }>("SELECT org_id, count(*)::int AS n FROM properties WHERE org_id IS NOT NULL GROUP BY org_id").catch(() => ({ rows: [] })),
      db().query<{ org_id: string; n: string }>("SELECT org_id, count(*)::int AS n FROM landlords WHERE org_id IS NOT NULL GROUP BY org_id").catch(() => ({ rows: [] })),
    ]);
    const tenantByOrg  = new Map(tenantCountsR.rows.map((x) => [x.org_id, Number(x.n)]));
    const propByOrg    = new Map(propertyCountsR.rows.map((x) => [x.org_id, Number(x.n)]));
    const lordByOrg    = new Map(landlordCountsR.rows.map((x) => [x.org_id, Number(x.n)]));

    interface Prof { id: string; email: string; fullName: string; role: string; createdAt: string; lastSignInAt: string | null }
    interface Org { id: string | null; name: string | null; createdAt: string | null; profiles: Prof[]; tenantCount: number; propertyCount: number; landlordCount: number; status: "fresh" | "active" | "empty" | "stale" }
    const byOrg = new Map<string, Org>();
    for (const row of r.rows) {
      const k = row.org_id ?? "null";
      let cur = byOrg.get(k);
      if (!cur) {
        const tn = row.org_id ? tenantByOrg.get(row.org_id) ?? 0 : 0;
        const pn = row.org_id ? propByOrg.get(row.org_id) ?? 0 : 0;
        const ln = row.org_id ? lordByOrg.get(row.org_id) ?? 0 : 0;
        cur = { id: row.org_id, name: row.org_name, createdAt: row.org_created_at, profiles: [], tenantCount: tn, propertyCount: pn, landlordCount: ln, status: "empty" };
        byOrg.set(k, cur);
      }
      cur.profiles.push({ id: row.profile_id, email: row.email, fullName: row.full_name, role: row.role, createdAt: row.created_at, lastSignInAt: row.last_sign_in });
    }
    // Status is a one-glance read: is this real customer activity, a fresh signup, an abandoned test, or stale?
    const now = Date.now();
    const DAY = 86400000;
    for (const org of byOrg.values()) {
      const ageDays = org.createdAt ? (now - new Date(org.createdAt).getTime()) / DAY : 0;
      const anyRecentSignIn = org.profiles.some((p) => p.lastSignInAt && (now - new Date(p.lastSignInAt).getTime()) / DAY < 30);
      const hasData = org.tenantCount + org.propertyCount + org.landlordCount > 0;
      if (hasData && anyRecentSignIn) org.status = "active";
      else if (ageDays < 7 && !hasData) org.status = "fresh";
      else if (!hasData && !anyRecentSignIn) org.status = "empty";
      else org.status = "stale";
    }

    const orgs = [...byOrg.values()];
    const stats = {
      totalOrgs: orgs.filter((o) => o.id).length,
      totalProfiles: r.rows.length,
      activeLast30Days: new Set(r.rows.filter((x) => x.last_sign_in && (now - new Date(x.last_sign_in).getTime()) / DAY < 30).map((x) => x.profile_id)).size,
      newOrgsThisWeek: orgs.filter((o) => o.createdAt && (now - new Date(o.createdAt).getTime()) / DAY < 7).length,
    };
    return NextResponse.json({ stats, orgs }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[platform/orgs:GET]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
