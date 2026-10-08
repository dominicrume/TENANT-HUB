import { NextResponse } from "next/server";
import { db, writeWithAudit, insertDocumentBlob, MAX_DOCUMENT_BYTES } from "@tenant-hub/db";
import { PropertyDocumentRequestSchema } from "@tenant-hub/validation";
import { withRouteHandler } from "../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../lib/safe-error";
import { looksLikeTenantDocument } from "../../../lib/document-types";
import { sendLandlordDocumentRequest } from "../../../lib/resend";

interface PropertyDocumentRow {
  id: string;
  org_id: string;
  property_id: string;
  document_type: string;
  blob_id: string | null;
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
 * pile", per the client's own words. File bytes live in document_blobs
 * (045), read only by the dedicated download route — never by this list.
 */
export const GET = withRouteHandler({ resource: "properties", action: "read" }, async (req, _ctx, auth) => {
  const propertyId = new URL(req.url).searchParams.get("propertyId");
  if (!propertyId) return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
  if (!auth.actor.org_id) return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });

  try {
    const r = await db().query<PropertyDocumentRow & { landlord_name: string | null }>(
      `SELECT pd.id, pd.org_id, pd.property_id, pd.document_type, pd.blob_id, pd.status,
              pd.requested_from_landlord_id, pd.requested_at, pd.notified_at, pd.received_at, pd.uploaded_by, pd.created_at,
              l.name AS landlord_name
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
 * POST — two shapes, told apart by content type:
 *   multipart/form-data { action: "add", property_id, document_type, file } — already in hand.
 *   application/json { action: "request", property_id, document_type, requested_from_landlord_id } —
 *     ask the landlord for it; the file arrives later via PATCH.
 */
export const POST = withRouteHandler({ resource: "properties", action: "create" }, async (req, _ctx, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const propertyId = form?.get("property_id");
    const documentType = form?.get("document_type");
    const file = form?.get("file");
    if (typeof propertyId !== "string" || typeof documentType !== "string" || !documentType.trim() || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
    }
    if (looksLikeTenantDocument(documentType)) {
      return NextResponse.json({ error: `"${documentType.trim()}" is a tenant document — add it on the tenant's own record, not the property.` }, { status: 422 });
    }
    if (file.size === 0) return NextResponse.json({ error: "That file is empty" }, { status: 422 });
    if (file.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: `File is too large (max ${MAX_DOCUMENT_BYTES / 1024 / 1024}MB)` }, { status: 413 });

    try {
      const owned = await db().query<{ id: string }>("SELECT id FROM properties WHERE id = $1 AND org_id = $2", [propertyId, auth.actor.org_id]);
      if (!owned.rows[0]) return NextResponse.json({ error: "Property not found" }, { status: 404 });

      const buffer = Buffer.from(await file.arrayBuffer());
      const blobId = await insertDocumentBlob(db(), {
        orgId: auth.actor.org_id,
        fileName: file.name || documentType,
        mimeType: file.type || "application/octet-stream",
        data: buffer,
      });

      const { data } = await writeWithAudit({
        table: "property_documents",
        record: {
          property_id: propertyId, document_type: documentType, blob_id: blobId,
          status: "received", received_at: new Date().toISOString(), uploaded_by: auth.actor.user_name, org_id: auth.actor.org_id,
        } as Record<string, unknown>,
        action: "CREATE", org_id: auth.actor.org_id, ...auth.actor,
      });
      return NextResponse.json(data, { status: 201 });
    } catch (err) {
      console.error("[property-documents:POST:add]", err);
      return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
    }
  }

  const body = await req.json().catch(() => null);
  const parsed = PropertyDocumentRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 422 });
  if (!parsed.data.requested_from_landlord_id) return NextResponse.json({ error: "Pick which landlord to ask" }, { status: 422 });
  if (looksLikeTenantDocument(parsed.data.document_type)) {
    return NextResponse.json({ error: `"${parsed.data.document_type}" is a tenant document — it belongs on the tenant's record, not a landlord request.` }, { status: 422 });
  }
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
    const row = data as Record<string, unknown>;

    // The request is real only if the landlord is actually told. Until
    // 2026-10-08 this stopped at the row above — "Requested" with nobody
    // asked. Now: email via Resend, and record notified_at only when Resend
    // accepted it; no address on file or a failed send leaves it null, and
    // the UI says so rather than implying the landlord knows.
    const info = await db().query<{ email: string | null; landlord: string; property: string }>(
      `SELECT l.contact_email AS email, l.name AS landlord, p.name AS property
       FROM landlords l, properties p
       WHERE l.id = $1 AND p.id = $2 AND l.org_id = $3 AND p.org_id = $3`,
      [parsed.data.requested_from_landlord_id, parsed.data.property_id, auth.actor.org_id]);
    const target = info.rows[0];
    let notifiedAt: string | null = null;
    if (target?.email) {
      const sent = await sendLandlordDocumentRequest(target.email, target.landlord, parsed.data.document_type, target.property, auth.actor.user_name);
      if (sent) {
        notifiedAt = new Date().toISOString();
        await writeWithAudit({
          table: "property_documents",
          record: { id: row["id"], notified_at: notifiedAt } as Record<string, unknown>,
          action: "UPDATE", org_id: auth.actor.org_id, ...auth.actor,
        });
      }
    }
    return NextResponse.json({ ...row, notified_at: notifiedAt, landlord_email: target?.email ?? null }, { status: 201 });
  } catch (err) {
    console.error("[property-documents:POST:request]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
