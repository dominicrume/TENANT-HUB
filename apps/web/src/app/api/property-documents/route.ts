import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { PropertyDocumentCreateSchema, PropertyDocumentRequestSchema } from "@tenant-hub/validation";
import { withRouteHandler } from "../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../lib/safe-error";

interface PropertyDocumentRow {
  id: string;
  org_id: string;
  property_id: string;
  document_type: string;
  file_url: string | null;
  status: string;
  requested_from_landlord_id: string | null;
  requested_at: string | null;
  received_at: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export const dynamic = "force-dynamic";

/**
 * A property's own documents (BUILD_PLAN C50/C51) — kept separate from a
 * tenant's (/api/documents, table tenant_documents): "documents needs to be
 * for the tenant AND for the property — two separate things, not one shared
 * pile", per the client's own words.
 */
export const GET = withRouteHandler({ resource: "properties", action: "read" }, async (req, _ctx, auth) => {
  const propertyId = new URL(req.url).searchParams.get("propertyId");
  if (!propertyId) return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
  if (!auth.actor.org_id) return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });

  try {
    const r = await db().query<PropertyDocumentRow & { landlord_name: string | null }>(
      `SELECT pd.*, l.name AS landlord_name
       FROM property_documents pd
       LEFT JOIN landlords l ON l.id = pd.requested_from_landlord_id
       WHERE pd.property_id = $1 AND pd.org_id = $2
       ORDER BY pd.created_at DESC`,
      [propertyId, auth.actor.org_id],
    );
    const data = r.rows.map(({ landlord_name, ...row }) => ({
      ...row,
      landlords: landlord_name ? { name: landlord_name } : null,
    }));
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});

/**
 * POST — two shapes, told apart by `action`:
 *   { action: "add", property_id, document_type, file_url } — already in hand.
 *   { action: "request", property_id, document_type, requested_from_landlord_id } —
 *     ask the landlord for it; file_url arrives later via PATCH.
 */
export const POST = withRouteHandler({ resource: "properties", action: "create" }, async (req, _ctx, auth) => {
  const body = await req.json().catch(() => null);
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  if (body?.action === "request") {
    const parsed = PropertyDocumentRequestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 422 });
    if (!parsed.data.requested_from_landlord_id) return NextResponse.json({ error: "Pick which landlord to ask" }, { status: 422 });
    try {
      const { data } = await writeWithAudit({
        table: "property_documents",
        record: {
          property_id: parsed.data.property_id, document_type: parsed.data.document_type,
          requested_from_landlord_id: parsed.data.requested_from_landlord_id,
          status: "requested", requested_at: new Date().toISOString(), org_id: auth.actor.org_id,
        } as Record<string, unknown>,
        action: "CREATE", org_id: auth.actor.org_id, ...auth.actor,
      });
      return NextResponse.json(data, { status: 201 });
    } catch (err) {
      console.error("[property-documents:POST:request]", err);
      return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
    }
  }

  const parsed = PropertyDocumentCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid document", issues: parsed.error.issues }, { status: 422 });
  try {
    const { data } = await writeWithAudit({
      table: "property_documents",
      record: { ...parsed.data, status: "received", received_at: new Date().toISOString(), uploaded_by: auth.actor.user_name, org_id: auth.actor.org_id } as Record<string, unknown>,
      action: "CREATE", org_id: auth.actor.org_id, ...auth.actor,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[property-documents:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
