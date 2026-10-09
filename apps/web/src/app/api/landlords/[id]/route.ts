import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { LandlordCreateSchema } from "@tenant-hub/validation";
import { withRouteHandler } from "../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/landlords/[id] — the landlord's profile: who they are, every
 * property we manage for them (with rooms filled / empty), the documents
 * we've asked them for, and how many tenants sit under them. "When I click
 * the landlord it should give me his information… and all his properties
 * under his name, because we manage four or five for some" (walkthrough
 * 2026-10-09). One route, four small reads.
 */
export const GET = withRouteHandler({ resource: "properties", action: "read" }, async (_req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const orgId = auth.actor.org_id;
  try {
    const landlord = (await db().query("SELECT id, name, contact_email, contact_phone, notes, created_at, updated_at FROM landlords WHERE id = $1 AND org_id = $2", [params.id, orgId])).rows[0];
    if (!landlord) return NextResponse.json({ error: "Landlord not found" }, { status: 404 });

    const [properties, documents, tenants] = await Promise.all([
      db().query<{ id: string; name: string; address_line1: string | null; city: string | null; postcode: string | null; asset_class: string; units_count: string; occupied_count: string }>(
        `SELECT p.id, p.name, p.address_line1, p.city, p.postcode, p.asset_class,
                (SELECT count(*) FROM units u WHERE u.property_id = p.id) AS units_count,
                (SELECT count(*) FROM tenancies t JOIN units u ON u.id = t.unit_id WHERE u.property_id = p.id AND t.status = 'active') AS occupied_count
         FROM properties p WHERE p.landlord_id = $1 AND p.org_id = $2 ORDER BY p.name`, [params.id, orgId]),
      db().query<{ id: string; document_type: string; status: string; requested_at: string | null; notified_at: string | null; received_at: string | null; property_id: string; property_name: string }>(
        `SELECT pd.id, pd.document_type, pd.status, pd.requested_at, pd.notified_at, pd.received_at, pd.property_id, p.name AS property_name
         FROM property_documents pd JOIN properties p ON p.id = pd.property_id
         WHERE pd.requested_from_landlord_id = $1 AND pd.org_id = $2 ORDER BY pd.created_at DESC`, [params.id, orgId]),
      db().query<{ count: string }>(
        `SELECT count(DISTINCT t.tenant_id) AS count FROM tenancies t JOIN units u ON u.id = t.unit_id JOIN properties p ON p.id = u.property_id
         WHERE p.landlord_id = $1 AND p.org_id = $2 AND t.status = 'active'`, [params.id, orgId]),
    ]);

    return NextResponse.json({
      landlord,
      properties: properties.rows.map((p) => ({ ...p, unitsCount: Number(p.units_count), occupiedCount: Number(p.occupied_count) })),
      documents: documents.rows,
      tenantsCount: Number(tenants.rows[0]?.count ?? 0),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});

/** PATCH /api/landlords/[id] — name / contact email / phone / notes. */
export const PATCH = withRouteHandler({ resource: "properties", action: "update" }, async (req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const body = await req.json().catch(() => null);
  const parsed = LandlordCreateSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid landlord", issues: parsed.error.issues }, { status: 422 });
  if (parsed.data.name !== undefined && !parsed.data.name.trim()) return NextResponse.json({ error: "A landlord needs a name" }, { status: 422 });
  try {
    const owned = await db().query("SELECT id FROM landlords WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id]);
    if (!owned.rows[0]) return NextResponse.json({ error: "Landlord not found" }, { status: 404 });
    const { data } = await writeWithAudit({
      table: "landlords",
      record: { id: params.id, ...parsed.data } as Record<string, unknown>,
      action: "UPDATE", org_id: auth.actor.org_id, ...auth.actor,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[landlords:PATCH]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
