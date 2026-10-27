import { NextResponse } from "next/server";
import { db, writeWithAudit, insertDocumentBlob, listEntityFiles, MAX_DOCUMENT_BYTES, type FileEntity } from "@tenant-hub/db";
import { toSafeErrorMessage } from "../../../../lib/safe-error";
import { fileAuth, entityOwned, isUuid, FILE_ENTITIES, withUrls } from "../../../../lib/files-auth";
import { looksLikeTenantDocument, looksLikePropertyDocument } from "../../../../lib/document-types";
import { emit } from "../../../../lib/webhooks";

export const dynamic = "force-dynamic";

const MAX_THUMB = 200 * 1024;

/**
 * POST /api/files/upload — THE upload path (docs/FILES_SPEC.md §4, H7).
 * multipart: entity, id, kind=photo|document, type (document type or
 * photo caption), file, thumb? (≤320px JPEG made on the device), width?,
 * height?. Files the row in the right table through writeWithAudit and
 * returns the FileItem the grid can render immediately.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const entity = form?.get("entity") as FileEntity | null;
  const id = form?.get("id");
  const kind = form?.get("kind");
  const type = typeof form?.get("type") === "string" ? String(form!.get("type")).trim() : "";
  const file = form?.get("file");
  const thumb = form?.get("thumb");
  const width = Number(form?.get("width") ?? 0) || null;
  const height = Number(form?.get("height") ?? 0) || null;

  if (!entity || !FILE_ENTITIES.includes(entity) || !isUuid(id)) return NextResponse.json({ error: "entity and id are required" }, { status: 400 });
  if (kind !== "photo" && kind !== "document") return NextResponse.json({ error: "kind must be photo or document" }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a file" }, { status: 422 });
  if (file.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: `File is too large (max ${MAX_DOCUMENT_BYTES / 1024 / 1024}MB)` }, { status: 413 });
  if (kind === "photo" && !file.type.startsWith("image/")) return NextResponse.json({ error: "Only image files can be added as photos" }, { status: 422 });
  if (kind === "photo" && entity !== "property" && entity !== "unit") return NextResponse.json({ error: "Photo galleries live on properties and rooms" }, { status: 422 });
  if (kind === "document" && entity === "unit") return NextResponse.json({ error: "Documents belong to the property, not a room" }, { status: 422 });
  if (kind === "document" && !type) return NextResponse.json({ error: "Pick what kind of document this is" }, { status: 422 });
  // The two trees stay separate (C50): a tenant document can't be filed on a property and vice versa.
  if (kind === "document" && entity === "property" && looksLikeTenantDocument(type)) return NextResponse.json({ error: `"${type}" is a tenant document — add it on the tenant's record, not the property.` }, { status: 422 });
  if (kind === "document" && entity === "tenant" && looksLikePropertyDocument(type)) return NextResponse.json({ error: `"${type}" is a property document — add it on the property's page, not the tenant's.` }, { status: 422 });

  const guard = await fileAuth(entity, "create");
  if (guard instanceof NextResponse) return guard;
  const { auth, orgId } = guard;

  try {
    if (!(await entityOwned(entity, id, auth))) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const thumbBuf = thumb instanceof File && thumb.size > 0 && thumb.size <= MAX_THUMB && thumb.type.startsWith("image/") ? Buffer.from(await thumb.arrayBuffer()) : null;
    const blobId = await insertDocumentBlob(db(), {
      orgId, fileName: file.name || type || "file", mimeType: file.type || "application/octet-stream",
      data: Buffer.from(await file.arrayBuffer()), thumb: thumbBuf, width, height,
    });

    const now = new Date().toISOString();
    let rowId: string;
    if (kind === "photo") {
      const existing = await listEntityFiles(db(), { orgId, entity, id });
      const firstPhoto = !existing.some((f) => f.kind === "photo");
      const { data } = await writeWithAudit({
        table: "entity_media",
        record: { org_id: orgId, entity_type: entity, entity_id: id, blob_id: blobId, caption: type || null, uploaded_by: auth.actor.user_name, is_cover: firstPhoto } as Record<string, unknown>,
        action: "CREATE", org_id: orgId, ...auth.actor,
      });
      rowId = String((data as Record<string, unknown>)["id"]);
    } else if (entity === "tenant") {
      // Sign-up pack: which of the seven sections this document belongs to (optional).
      const sectionRaw = Number(form?.get("section") ?? 0);
      const section = sectionRaw >= 1 && sectionRaw <= 7 ? sectionRaw : null;
      const { data } = await writeWithAudit({
        table: "tenant_documents",
        record: { tenant_id: id, name: type, blob_id: blobId, uploaded_by: auth.actor.user_name, file_url: null, section } as Record<string, unknown>,
        action: "CREATE", org_id: orgId, tenant_id: id, ...auth.actor,
      });
      rowId = String((data as Record<string, unknown>)["id"]);
      emit(orgId, "document.filed", data as Record<string, unknown>);
    } else if (entity === "property") {
      const { data } = await writeWithAudit({
        table: "property_documents",
        record: { property_id: id, document_type: type, blob_id: blobId, status: "received", received_at: now, uploaded_by: auth.actor.user_name, org_id: orgId } as Record<string, unknown>,
        action: "CREATE", org_id: orgId, ...auth.actor,
      });
      rowId = String((data as Record<string, unknown>)["id"]);
      emit(orgId, "document.received", data as Record<string, unknown>);
    } else {
      const expiresOn = typeof form?.get("expiresOn") === "string" && String(form!.get("expiresOn")) ? String(form!.get("expiresOn")) : null;
      const { data } = await writeWithAudit({
        table: "landlord_documents",
        record: { org_id: orgId, landlord_id: id, document_type: type, blob_id: blobId, uploaded_by: auth.actor.user_name, expires_on: expiresOn } as Record<string, unknown>,
        action: "CREATE", org_id: orgId, ...auth.actor,
      });
      rowId = String((data as Record<string, unknown>)["id"]);
    }

    const items = await listEntityFiles(db(), { orgId, entity, id });
    const item = items.find((f) => f.id === rowId) ?? null;
    return NextResponse.json({ item: item ? withUrls(item) : null, items: items.map(withUrls) }, { status: 201 });
  } catch (err) {
    console.error("[files/upload]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
