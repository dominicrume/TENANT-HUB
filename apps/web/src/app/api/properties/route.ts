import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { PropertyCreateSchema } from "@tenant-hub/validation";
import { withRouteHandler } from "../../../lib/api-handler";

export const dynamic = "force-dynamic";

interface UnitRow { id: string; property_id: string; status: string }
interface TenancyRow { unit_id: string; tenant_id: string }
interface ArrearsRow { tenant_id: string; balance: string | number }

/**
 * GET /api/properties — every home, with the two summaries the list screen
 * leads with: how many units are occupied, and how much is outstanding
 * (open certificate alerts, tenancies currently in arrears). Four small
 * reads joined in memory — the same shape needs-you.ts already uses —
 * rather than a hand-rolled SQL join through supabase-js.
 */
export const GET = withRouteHandler({ resource: "properties", action: "read" }, async (_req, _ctx, auth) => {
  const sb = auth.supabase;
  const [props, units, alerts, tenancies, arrears, landlords] = await Promise.all([
    sb.from("properties").select("id, name, address_line1, city, postcode, asset_class, floors, landlord_id, created_at").order("name"),
    sb.from("units").select("id, property_id, status"),
    sb.from("compliance_alerts").select("property_id").is("resolved_at", null),
    sb.from("tenancies").select("unit_id, tenant_id").eq("status", "active"),
    sb.from("tenancy_arrears").select("tenant_id, balance"),
    sb.from("landlords").select("id, name"),
  ]);
  const failed = [props, units, alerts, tenancies, arrears, landlords].find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  const landlordName = new Map((landlords.data ?? []).map((l: { id: string; name: string }) => [l.id, l.name]));

  const unitsByProperty = new Map<string, UnitRow[]>();
  for (const u of (units.data ?? []) as UnitRow[]) unitsByProperty.set(u.property_id, [...(unitsByProperty.get(u.property_id) ?? []), u]);
  const alertsByProperty = new Map<string, number>();
  for (const a of (alerts.data ?? []) as { property_id: string }[]) alertsByProperty.set(a.property_id, (alertsByProperty.get(a.property_id) ?? 0) + 1);
  const arrearsByTenant = new Map((arrears.data as ArrearsRow[] | null ?? []).map((a) => [a.tenant_id, Number(a.balance)]));
  const tenancyByUnit = new Map((tenancies.data as TenancyRow[] | null ?? []).map((t) => [t.unit_id, t.tenant_id]));

  const result = (props.data ?? []).map((p) => {
    const us = unitsByProperty.get(p.id) ?? [];
    const arrearsCount = us.filter((u) => {
      const tenantId = tenancyByUnit.get(u.id);
      return tenantId && (arrearsByTenant.get(tenantId) ?? 0) > 0;
    }).length;
    return {
      ...p, unitsCount: us.length, occupiedCount: us.filter((u) => u.status === "occupied").length,
      openAlerts: alertsByProperty.get(p.id) ?? 0, arrearsCount,
      landlordName: p.landlord_id ? (landlordName.get(p.landlord_id) ?? null) : null,
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
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
});
