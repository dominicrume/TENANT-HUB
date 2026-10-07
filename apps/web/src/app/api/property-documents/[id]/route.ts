import { NextResponse } from "next/server";
import { db, writeWithAudit, insertDocumentBlob, MAX_DOCUMENT_BYTES } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/property-documents/[id] — the landlord came through: attach the
 * file to a "requested" document and flip it to "received" (BUILD_PLAN C51).
 * multipart/form-data { file }.
 */
export const PATCH = withRouteHandler({ resource: "properties", action: "update" }, async (req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 422 });
  if (file.size === 0) return NextResponse.json({ error: "That file is empty" }, { status: 422 });
  if (file.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: `File is too large (max ${MAX_DOCUMENT_BYTES / 1024 / 1024}MB)` }, { status: 413 });

  try {
    const owned = await db().query<{ id: string }>("SELECT id FROM property_documents WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id]);
    if (!owned.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const blobId = await insertDocumentBlob(db(), {
      orgId: auth.actor.org_id,
      fileName: file.name || "document",
      mimeType: file.type || "application/octet-stream",
      data: buffer,
    });

    const { data } = await writeWithAudit({
      table: "property_documents",
      record: { id: params.id, blob_id: blobId, status: "received", received_at: new Date().toISOString(), uploaded_by: auth.actor.user_name } as Record<string, unknown>,
      action: "UPDATE", org_id: auth.actor.org_id, ...auth.actor,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[property-documents/[id]:PATCH]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
