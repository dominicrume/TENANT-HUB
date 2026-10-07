import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { requiredCertificatesFor, certificateStatus, certBase } from "@tenant-hub/domain";
import type { AssetClass, UnitClass } from "@tenant-hub/validation";
import { withRouteHandler } from "../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../lib/safe-error";

export const dynamic = "force-dynamic";

interface PropertyRow { id: string; name: string; asset_class: AssetClass }
interface UnitRow { property_id: string; unit_class: UnitClass }
interface CertTypeRow { id: string; name: string }
interface CertRow { property_id: string; certificate_type_id: string; name: string; expires_on: string | null; issued_on: string | null }

export interface PaperworkCell {
  name: string;
  certificateTypeId: string | null;
  status: ReturnType<typeof certificateStatus>["status"];
  alert: ReturnType<typeof certificateStatus>["alert"];
  expiresOn: string | null;
}
export interface PaperworkRow { propertyId: string; propertyName: string; assetClass: AssetClass; cells: PaperworkCell[] }

/**
 * GET /api/paperwork — the certificate matrix: one row per home, one column
 * per certificate its asset class actually requires (@tenant-hub/domain's
 * requiredCertificatesFor — H13, the same rule compliance-watch computes its
 * alerts from, so this screen and the alerts it resolves can never disagree).
 */
export const GET = withRouteHandler({ resource: "compliance", action: "read" }, async (_req, _ctx, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ rows: [] }, { headers: { "Cache-Control": "no-store" } });
  const orgId = auth.actor.org_id;

  try {
    // certificate_types is a shared reference catalogue (no org_id column by
    // design — the list of UK statutory certificate kinds is the same for
    // every organisation), so it is read unscoped; every other table here
    // carries org_id and is filtered by it explicitly (replacing Supabase RLS).
    const [props, units, certTypes, certs] = await Promise.all([
      db().query<PropertyRow>("SELECT id, name, asset_class FROM properties WHERE org_id = $1 ORDER BY name", [orgId]),
      db().query<UnitRow>("SELECT property_id, unit_class FROM units WHERE org_id = $1", [orgId]),
      db().query<CertTypeRow>("SELECT id, name FROM certificate_types"),
      db().query<{ property_id: string; certificate_type_id: string; expires_on: string | null; issued_on: string | null; name: string }>(
        `SELECT c.property_id, c.certificate_type_id, c.expires_on, c.issued_on, ct.name
         FROM certificates c JOIN certificate_types ct ON ct.id = c.certificate_type_id
         WHERE c.org_id = $1`, [orgId]),
    ]);

    const unitClassesByProperty = new Map<string, UnitClass[]>();
    for (const u of units.rows) unitClassesByProperty.set(u.property_id, [...(unitClassesByProperty.get(u.property_id) ?? []), u.unit_class]);
    const typeIdByName = new Map(certTypes.rows.map((t) => [certBase(t.name), t.id]));
    const certRows: CertRow[] = certs.rows.map((c) => ({ property_id: c.property_id, certificate_type_id: c.certificate_type_id, name: c.name ?? "", expires_on: c.expires_on, issued_on: c.issued_on }));

    const rows: PaperworkRow[] = props.rows.map((p) => {
      const required = requiredCertificatesFor(p.asset_class, unitClassesByProperty.get(p.id) ?? []);
      const cells: PaperworkCell[] = required.map((name) => {
        const held = certRows
          .filter((c) => c.property_id === p.id && certBase(c.name) === certBase(name))
          .sort((a, b) => new Date(b.expires_on ?? 0).getTime() - new Date(a.expires_on ?? 0).getTime())[0];
        const status = certificateStatus(held?.expires_on ?? null);
        return { name, certificateTypeId: typeIdByName.get(certBase(name)) ?? null, status: status.status, alert: status.alert, expiresOn: held?.expires_on ?? null };
      });
      return { propertyId: p.id, propertyName: p.name, assetClass: p.asset_class, cells };
    });

    return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
