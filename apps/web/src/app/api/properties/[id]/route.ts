import { NextResponse } from "next/server";
import { withRouteHandler } from "../../../../lib/api-handler";

export const dynamic = "force-dynamic";

/**
 * GET /api/properties/[id] — the home page: the property itself, its rooms,
 * each room's current tenancy (with the tenant's name), its certificates
 * (with the certificate type's name) and its insurance policies. One route,
 * five small reads, joined in memory.
 */
export const GET = withRouteHandler({ resource: "properties", action: "read" }, async (_req, { params }: { params: { id: string } }, auth) => {
  const sb = auth.supabase;
  const [property, units, tenancies, certificates, policies] = await Promise.all([
    sb.from("properties").select("*").eq("id", params.id).single(),
    sb.from("units").select("id, reference, unit_class, floor, bedrooms, status").eq("property_id", params.id).order("reference"),
    sb.from("tenancies").select("id, unit_id, tenant_id, rent_amount, rent_frequency, status, start_date, tenants(full_name)").eq("status", "active"),
    sb.from("certificates").select("id, certificate_type_id, issued_on, expires_on, certificate_types(name)").eq("property_id", params.id),
    sb.from("insurance_policies").select("id, insurer, policy_reference, renewal_date, annual_premium").eq("property_id", params.id),
  ]);
  if (property.error) return NextResponse.json({ error: property.error.message }, { status: property.error.code === "PGRST116" ? 404 : 500 });
  const failed = [units, tenancies, certificates, policies].find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  const unitIds = new Set((units.data ?? []).map((u) => u.id));
  const tenancyByUnit = new Map((tenancies.data ?? []).filter((t) => unitIds.has(t.unit_id)).map((t) => [t.unit_id, t]));

  return NextResponse.json(
    {
      property: property.data,
      units: (units.data ?? []).map((u) => ({ ...u, tenancy: tenancyByUnit.get(u.id) ?? null })),
      certificates: certificates.data ?? [],
      policies: policies.data ?? [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
