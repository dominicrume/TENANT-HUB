import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { PropertyCreateSchema } from "@tenant-hub/validation";
import type { AssetClass, UnitClass } from "@tenant-hub/validation";
import { requiredCertificatesFor, certificateStatus, certBase } from "@tenant-hub/domain";
import { withRouteHandler } from "../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../lib/safe-error";

export const dynamic = "force-dynamic";

interface UnitRow { id: string; property_id: string; status: string; unit_class: UnitClass }
interface TenancyRow { unit_id: string; tenant_id: string }
interface ArrearsRow { tenant_id: string; balance: string | number }
interface CertRow { property_id: string; certificate_type_id: string; name: string; expires_on: string | null }

/**
 * GET /api/properties — every property, with the summaries the list screen
 * leads with: how many units are occupied, how much is outstanding, and
 * (BUILD_PLAN C49) whether it's Active or still Pending — missing a room, or
 * a certificate its asset class requires. The pending check reuses
 * @tenant-hub/domain's requiredCertificatesFor/certificateStatus — the exact
 * same rule the Paperwork matrix and compliance-watch use — so this list and
 * that screen can never disagree about what's actually missing (H3).
 */
export const GET = withRouteHandler({ resource: "properties", action: "read" }, async (_req, _ctx, auth) => {
  if (!auth.actor.org_id) return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
  const orgId = auth.actor.org_id;

  interface PropertyRow { id: string; name: string; address_line1: string | null; city: string | null; postcode: string | null; asset_class: AssetClass; floors: number | null; landlord_id: string | null; created_at: string }

  let props, units, alerts, tenancies, arrears, landlords, certs;
  try {
    [props, units, alerts, tenancies, arrears, landlords, certs] = await Promise.all([
      db().query<PropertyRow>("SELECT id, name, address_line1, city, postcode, asset_class, floors, landlord_id, created_at FROM properties WHERE org_id = $1 ORDER BY name", [orgId]),
      db().query<UnitRow>("SELECT id, property_id, status, unit_class FROM units WHERE org_id = $1", [orgId]),
      db().query<{ property_id: string }>("SELECT property_id FROM compliance_alerts WHERE org_id = $1 AND resolved_at IS NULL", [orgId]),
      db().query<TenancyRow>("SELECT unit_id, tenant_id FROM tenancies WHERE org_id = $1 AND status = 'active'", [orgId]),
      db().query<ArrearsRow>("SELECT tenant_id, balance FROM tenancy_arrears WHERE org_id = $1", [orgId]),
      db().query<{ id: string; name: string }>("SELECT id, name FROM landlords WHERE org_id = $1", [orgId]),
      db().query<{ property_id: string; certificate_type_id: string; expires_on: string | null; name: string }>(
        "SELECT c.property_id, c.certificate_type_id, c.expires_on, ct.name FROM certificates c JOIN certificate_types ct ON ct.id = c.certificate_type_id WHERE c.org_id = $1", [orgId]),
    ]);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }

  const landlordName = new Map(landlords.rows.map((l) => [l.id, l.name]));

  const unitsByProperty = new Map<string, UnitRow[]>();
  for (const u of units.rows) unitsByProperty.set(u.property_id, [...(unitsByProperty.get(u.property_id) ?? []), u]);
  const alertsByProperty = new Map<string, number>();
  for (const a of alerts.rows) alertsByProperty.set(a.property_id, (alertsByProperty.get(a.property_id) ?? 0) + 1);
  const arrearsByTenant = new Map(arrears.rows.map((a) => [a.tenant_id, Number(a.balance)]));
  const tenancyByUnit = new Map(tenancies.rows.map((t) => [t.unit_id, t.tenant_id]));
  const certRows: CertRow[] = certs.rows.map((c) => ({ property_id: c.property_id, certificate_type_id: c.certificate_type_id, name: c.name ?? "", expires_on: c.expires_on }));

  const result = props.rows.map((p) => {
    const us = unitsByProperty.get(p.id) ?? [];
    const arrearsCount = us.filter((u) => {
      const tenantId = tenancyByUnit.get(u.id);
      return tenantId && (arrearsByTenant.get(tenantId) ?? 0) > 0;
    }).length;

    const pendingReasons: string[] = [];
    if (us.length === 0) pendingReasons.push("No rooms added yet");
    const required = requiredCertificatesFor(p.asset_class as AssetClass, us.map((u) => u.unit_class));
    for (const name of required) {
      const held = certRows
        .filter((c) => c.property_id === p.id && certBase(c.name) === certBase(name))
        .sort((a, b) => new Date(b.expires_on ?? 0).getTime() - new Date(a.expires_on ?? 0).getTime())[0];
      const { status } = certificateStatus(held?.expires_on ?? null);
      if (status === "missing") pendingReasons.push(`${name} missing`);
      else if (status === "expired") pendingReasons.push(`${name} expired`);
    }

    return {
      ...p, unitsCount: us.length, occupiedCount: us.filter((u) => u.status === "occupied").length,
      openAlerts: alertsByProperty.get(p.id) ?? 0, arrearsCount,
      landlordName: p.landlord_id ? (landlordName.get(p.landlord_id) ?? null) : null,
      status: pendingReasons.length > 0 ? ("pending" as const) : ("active" as const),
      pendingReasons,
    };
  });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
});

/** POST /api/properties — Add home: three fields (name, address, postcode) plus its asset class. */
export const POST = withRouteHandler({ resource: "properties", action: "create" }, async (req, _ctx, auth) => {
  const body = await req.json().catch(() => null);
  const parsed = PropertyCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid property", issues: parsed.error.issues }, { status: 422 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  try {
    const { data } = await writeWithAudit({
      table: "properties",
      record: { ...parsed.data, org_id: auth.actor.org_id } as Record<string, unknown>,
      action: "CREATE",
      org_id: auth.actor.org_id,
      ...auth.actor,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[properties:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
