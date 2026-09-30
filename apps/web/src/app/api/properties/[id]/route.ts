import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
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

  const landlordId = (property.data as { landlord_id?: string | null }).landlord_id;
  const landlord = landlordId
    ? (await sb.from("landlords").select("id, name, contact_email, contact_phone").eq("id", landlordId).maybeSingle()).data
    : null;

  const unitIds = new Set((units.data ?? []).map((u) => u.id));
  const tenancyByUnit = new Map((tenancies.data ?? []).filter((t) => unitIds.has(t.unit_id)).map((t) => [t.unit_id, t]));

  return NextResponse.json(
    {
      property: property.data,
      landlord,
      units: (units.data ?? []).map((u) => ({ ...u, tenancy: tenancyByUnit.get(u.id) ?? null })),
      certificates: certificates.data ?? [],
      policies: policies.data ?? [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});

/**
 * PATCH /api/properties/[id] — assign (or clear) a property's landlord after
 * the fact (BUILD_PLAN C46/C47). Deliberately narrow: only landlord_id, not a
 * general property editor.
 */
export const PATCH = withRouteHandler({ resource: "properties", action: "update" }, async (req, { params }: { params: { id: string } }, auth) => {
  const body = await req.json().catch(() => null);
  if (!body || !("landlord_id" in body)) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  if (body.landlord_id !== null && typeof body.landlord_id !== "string") {
    return NextResponse.json({ error: "landlord_id must be a string or null" }, { status: 422 });
  }

  try {
    const { data } = await writeWithAudit({
      table: "properties",
      record: { id: params.id, landlord_id: body.landlord_id } as Record<string, unknown>,
      action: "UPDATE",
      org_id: auth.actor.org_id,
      ...auth.actor,
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
});
