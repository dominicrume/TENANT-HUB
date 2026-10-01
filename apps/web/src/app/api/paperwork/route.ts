import { NextResponse } from "next/server";
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
  const sb = auth.supabase;
  const [props, units, certTypes, certs] = await Promise.all([
    sb.from("properties").select("id, name, asset_class").order("name"),
    sb.from("units").select("property_id, unit_class"),
    sb.from("certificate_types").select("id, name"),
    sb.from("certificates").select("property_id, certificate_type_id, expires_on, issued_on, certificate_types(name)"),
  ]);
  const failed = [props, units, certTypes, certs].find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: toSafeErrorMessage(failed.error) }, { status: 500 });

  const unitClassesByProperty = new Map<string, UnitClass[]>();
  for (const u of (units.data as UnitRow[] | null) ?? []) unitClassesByProperty.set(u.property_id, [...(unitClassesByProperty.get(u.property_id) ?? []), u.unit_class]);
  const typeIdByName = new Map(((certTypes.data as CertTypeRow[] | null) ?? []).map((t) => [certBase(t.name), t.id]));
  const certRows = ((certs.data as unknown as Array<{ property_id: string; certificate_type_id: string; expires_on: string | null; issued_on: string | null; certificate_types: { name: string } | null }>) ?? [])
    .map((c) => ({ property_id: c.property_id, certificate_type_id: c.certificate_type_id, name: c.certificate_types?.name ?? "", expires_on: c.expires_on, issued_on: c.issued_on }) satisfies CertRow);

  const rows: PaperworkRow[] = ((props.data as PropertyRow[] | null) ?? []).map((p) => {
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
});
