import { NextResponse } from "next/server";
import { db, listEntityFiles, type FileEntity } from "@tenant-hub/db";
import { toSafeErrorMessage } from "../../../lib/safe-error";
import { fileAuth, entityOwned, isUuid, FILE_ENTITIES, withUrls } from "../../../lib/files-auth";
import { REQUIRED_DOCUMENTS, documentTypesFor } from "../../../lib/document-types";

export const dynamic = "force-dynamic";

type ChecklistItem = { type: string; status: "have" | "missing" | "expired" | "requested"; fileId?: string };

/**
 * GET /api/files?entity=tenant|property|unit|landlord&id=… — every photo
 * and document that thing holds, in one shape, plus the required-document
 * checklist (docs/FILES_SPEC.md §4). Thumbnails and bytes are separate
 * routes; this is metadata only, so it's fast however big the files are.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const entity = url.searchParams.get("entity") as FileEntity | null;
  const id = url.searchParams.get("id");
  if (!entity || !FILE_ENTITIES.includes(entity) || !isUuid(id)) return NextResponse.json({ error: "entity and id are required" }, { status: 400 });
  const guard = await fileAuth(entity, "read");
  if (guard instanceof NextResponse) return guard;
  try {
    if (!(await entityOwned(entity, id, guard.orgId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const items = await listEntityFiles(db(), { orgId: guard.orgId, entity, id });
    const today = new Date().toISOString().slice(0, 10);
    const checklist: ChecklistItem[] = REQUIRED_DOCUMENTS[entity].map((type) => {
      const hits = items.filter((f) => f.kind === "document" && f.name.toLowerCase().startsWith(type.toLowerCase()));
      const have = hits.find((f) => f.status === "received" && f.blobId);
      if (have) return { type, status: have.expiresOn && have.expiresOn < today ? "expired" : "have", fileId: have.id };
      const requested = hits.find((f) => f.status === "requested");
      return requested ? { type, status: "requested", fileId: requested.id } : { type, status: "missing" };
    });
    return NextResponse.json({
      items: items.map(withUrls),
      checklist,
      documentTypes: documentTypesFor(entity),
      counts: { photos: items.filter((f) => f.kind === "photo").length, documents: items.filter((f) => f.kind === "document" && f.blobId).length, requested: items.filter((f) => f.status === "requested").length },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
