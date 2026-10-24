import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { requiredCertificatesFor, certificateStatus, certBase } from "@tenant-hub/domain";
import type { AssetClass, UnitClass } from "@tenant-hub/validation";
import { withRouteHandler } from "../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard-analytics — the top-of-dashboard snapshot Matlub asked
 * for (2026-10-24 walkthrough): one picture of how the business is doing,
 * split into Occupancy (rooms filled / void, with the breakdown per
 * property) and Compliance (certificates missing or expiring, with the
 * list behind the number). Same facts the Paperwork matrix and
 * compliance-watch work from — never a separate derivation (H3).
 */
export const GET = withRouteHandler({ resource: "compliance", action: "read" }, async (_req, _ctx, auth) => {
  if (!auth.actor.org_id) {
    return NextResponse.json({
      occupancy: { rooms: 0, filled: 0, empty: 0, pct: 0, byProperty: [] },
      compliance: { required: 0, held: 0, missing: 0, expiringIn30: 0, issues: [] },
    }, { headers: { "Cache-Control": "no-store" } });
  }
  const org = auth.actor.org_id;

  try {
    const [props, units, tenancies, certTypes, certs] = await Promise.all([
      db().query<{ id: string; name: string; asset_class: AssetClass }>(
        "SELECT id, name, asset_class FROM properties WHERE org_id = $1 ORDER BY name", [org]),
      db().query<{ id: string; property_id: string; unit_class: UnitClass }>(
        "SELECT id, property_id, unit_class FROM units WHERE org_id = $1", [org]),
      db().query<{ unit_id: string; property_id: string | null }>(
        "SELECT ty.unit_id, u.property_id FROM tenancies ty JOIN units u ON u.id = ty.unit_id WHERE ty.org_id = $1 AND ty.status = 'active'", [org]),
      db().query<{ id: string; name: string }>("SELECT id, name FROM certificate_types"),
      db().query<{ property_id: string; certificate_type_id: string; name: string; expires_on: string | null }>(
        `SELECT c.property_id, c.certificate_type_id, c.expires_on, ct.name
         FROM certificates c JOIN certificate_types ct ON ct.id = c.certificate_type_id
         WHERE c.org_id = $1`, [org]),
    ]);

    // Occupancy — a filled unit is one with an active tenancy.
    const unitsByProperty = new Map<string, string[]>();
    const classesByProperty = new Map<string, UnitClass[]>();
    for (const u of units.rows) {
      unitsByProperty.set(u.property_id, [...(unitsByProperty.get(u.property_id) ?? []), u.id]);
      classesByProperty.set(u.property_id, [...(classesByProperty.get(u.property_id) ?? []), u.unit_class]);
    }
    const filledUnits = new Set(tenancies.rows.map((t) => t.unit_id));
    let totalRooms = 0; let totalFilled = 0;
    const byProperty = props.rows.map((p) => {
      const uIds = unitsByProperty.get(p.id) ?? [];
      const filled = uIds.filter((id) => filledUnits.has(id)).length;
      totalRooms += uIds.length; totalFilled += filled;
      return { id: p.id, name: p.name, filled, total: uIds.length };
    }).sort((a, b) => (b.total - b.filled) - (a.total - a.filled) || a.name.localeCompare(b.name));

    // Compliance — walk every property's required cert list, check what's on file.
    type Issue = { propertyId: string; propertyName: string; certName: string; status: "missing" | "expired" | "expiring"; expiresOn: string | null };
    let required = 0, held = 0, missing = 0, expiring = 0;
    const issues: Issue[] = [];
    const now = new Date(new Date().toDateString());
    for (const p of props.rows) {
      const need = requiredCertificatesFor(p.asset_class, classesByProperty.get(p.id) ?? []);
      for (const name of need) {
        required++;
        const row = certs.rows
          .filter((c) => c.property_id === p.id && certBase(c.name) === certBase(name))
          .sort((a, b) => new Date(b.expires_on ?? 0).getTime() - new Date(a.expires_on ?? 0).getTime())[0];
        const st = certificateStatus(row?.expires_on ?? null);
        if (st.status === "valid") {
          held++;
          if (row?.expires_on) {
            const days = Math.ceil((new Date(row.expires_on).getTime() - now.getTime()) / 86400000);
            if (days <= 30) { expiring++; issues.push({ propertyId: p.id, propertyName: p.name, certName: name, status: "expiring", expiresOn: row.expires_on }); }
          }
        } else if (st.status === "expired") { missing++; issues.push({ propertyId: p.id, propertyName: p.name, certName: name, status: "expired", expiresOn: row?.expires_on ?? null }); }
        else { missing++; issues.push({ propertyId: p.id, propertyName: p.name, certName: name, status: "missing", expiresOn: null }); }
      }
    }
    issues.sort((a, b) => (a.status === "missing" ? 0 : a.status === "expired" ? 1 : 2) - (b.status === "missing" ? 0 : b.status === "expired" ? 1 : 2));

    return NextResponse.json({
      occupancy: {
        rooms: totalRooms,
        filled: totalFilled,
        empty: totalRooms - totalFilled,
        pct: totalRooms ? Math.round((totalFilled / totalRooms) * 100) : 0,
        byProperty,
      },
      compliance: { required, held, missing, expiringIn30: expiring, issues: issues.slice(0, 20) },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[dashboard-analytics:GET]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
