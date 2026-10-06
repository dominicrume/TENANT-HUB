import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/properties/[id] — the home page: the property itself, its rooms,
 * each room's current tenancy (with the tenant's name), its certificates
 * (with the certificate type's name) and its insurance policies. One route,
 * five small reads, joined in memory.
 */
export const GET = withRouteHandler({ resource: "properties", action: "read" }, async (_req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const orgId = auth.actor.org_id;

  try {
    const propertyR = await db().query("SELECT * FROM properties WHERE id = $1 AND org_id = $2", [params.id, orgId]);
    const property = propertyR.rows[0];
    if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [units, tenancies, certificates, policies] = await Promise.all([
      db().query<{ id: string; reference: string; unit_class: string; floor: number | null; bedrooms: number | null; status: string }>(
        "SELECT id, reference, unit_class, floor, bedrooms, status FROM units WHERE property_id = $1 AND org_id = $2 ORDER BY reference", [params.id, orgId]),
      db().query<{ id: string; unit_id: string; tenant_id: string; rent_amount: string; rent_frequency: string; status: string; start_date: string | null; full_name: string }>(
        `SELECT t.id, t.unit_id, t.tenant_id, t.rent_amount, t.rent_frequency, t.status, t.start_date, tn.full_name
         FROM tenancies t JOIN tenants tn ON tn.id = t.tenant_id
         WHERE t.org_id = $2 AND t.status = 'active' AND t.unit_id IN (SELECT id FROM units WHERE property_id = $1)`, [params.id, orgId]),
      db().query<{ id: string; certificate_type_id: string; issued_on: string | null; expires_on: string | null; name: string }>(
        `SELECT c.id, c.certificate_type_id, c.issued_on, c.expires_on, ct.name
         FROM certificates c JOIN certificate_types ct ON ct.id = c.certificate_type_id
         WHERE c.property_id = $1 AND c.org_id = $2`, [params.id, orgId]),
      db().query("SELECT id, insurer, policy_reference, renewal_date, annual_premium FROM insurance_policies WHERE property_id = $1 AND org_id = $2", [params.id, orgId]),
    ]);

    const landlordId = property["landlord_id"] as string | null;
    const landlord = landlordId
      ? (await db().query("SELECT id, name, contact_email, contact_phone FROM landlords WHERE id = $1 AND org_id = $2", [landlordId, orgId])).rows[0] ?? null
      : null;

    const tenancyByUnit = new Map(tenancies.rows.map((t) => [t.unit_id, { ...t, tenants: { full_name: t.full_name } }]));

    return NextResponse.json(
      {
        property,
        landlord,
        units: units.rows.map((u) => ({ ...u, tenancy: tenancyByUnit.get(u.id) ?? null })),
        certificates: certificates.rows.map((c) => ({ id: c.id, certificate_type_id: c.certificate_type_id, issued_on: c.issued_on, expires_on: c.expires_on, certificate_types: { name: c.name } })),
        policies: policies.rows,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
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
    console.error("[properties/[id]:PATCH]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
