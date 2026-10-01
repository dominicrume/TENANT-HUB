import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
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
  const sb = auth.supabase;
  const [props, units, alerts, tenancies, arrears, landlords, certs] = await Promise.all([
    sb.from("properties").select("id, name, address_line1, city, postcode, asset_class, floors, landlord_id, created_at").order("name"),
    sb.from("units").select("id, property_id, status, unit_class"),
    sb.from("compliance_alerts").select("property_id").is("resolved_at", null),
    sb.from("tenancies").select("unit_id, tenant_id").eq("status", "active"),
    sb.from("tenancy_arrears").select("tenant_id, balance"),
    sb.from("landlords").select("id, name"),
    sb.from("certificates").select("property_id, certificate_type_id, expires_on, certificate_types(name)"),
  ]);
  const failed = [props, units, alerts, tenancies, arrears, landlords, certs].find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: toSafeErrorMessage(failed.error) }, { status: 500 });

  const landlordName = new Map((landlords.data ?? []).map((l: { id: string; name: string }) => [l.id, l.name]));

  const unitsByProperty = new Map<string, UnitRow[]>();
  for (const u of (units.data ?? []) as UnitRow[]) unitsByProperty.set(u.property_id, [...(unitsByProperty.get(u.property_id) ?? []), u]);
  const alertsByProperty = new Map<string, number>();
  for (const a of (alerts.data ?? []) as { property_id: string }[]) alertsByProperty.set(a.property_id, (alertsByProperty.get(a.property_id) ?? 0) + 1);
  const arrearsByTenant = new Map((arrears.data as ArrearsRow[] | null ?? []).map((a) => [a.tenant_id, Number(a.balance)]));
  const tenancyByUnit = new Map((tenancies.data as TenancyRow[] | null ?? []).map((t) => [t.unit_id, t.tenant_id]));
  const certRows = ((certs.data as unknown as Array<{ property_id: string; certificate_type_id: string; expires_on: string | null; certificate_types: { name: string } | null }>) ?? [])
    .map((c) => ({ property_id: c.property_id, certificate_type_id: c.certificate_type_id, name: c.certificate_types?.name ?? "", expires_on: c.expires_on }) satisfies CertRow);

  const result = (props.data ?? []).map((p) => {
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
