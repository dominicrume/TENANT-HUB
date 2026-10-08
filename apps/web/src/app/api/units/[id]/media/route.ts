import { NextResponse } from "next/server";
import { db, insertDocumentBlob, insertMedia, listMedia, MAX_DOCUMENT_BYTES } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../../lib/api-handler";

export const dynamic = "force-dynamic";

/** GET — this room's photo gallery (metadata only; bytes served via /api/media/[mediaId]). */
export const GET = withRouteHandler({ resource: "properties", action: "read" }, async (_req, { params }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json([]);
  const rows = await listMedia(db(), { orgId: auth.actor.org_id, entityType: "unit", entityId: params.id });
  return NextResponse.json(rows.map((r) => ({ id: r.id, caption: r.caption, uploadedBy: r.uploadedBy, createdAt: r.createdAt, url: `/api/media/${r.id}` })));
});

/** POST multipart/form-data { file, caption? } — adds one photo to the room's gallery. */
export const POST = withRouteHandler({ resource: "properties", action: "update" }, async (req, { params }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const caption = form?.get("caption");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 422 });
  if (file.size === 0) return NextResponse.json({ error: "That file is empty" }, { status: 422 });
  if (file.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: `File is too large (max ${MAX_DOCUMENT_BYTES / 1024 / 1024}MB)` }, { status: 413 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Only image files can be added to the gallery" }, { status: 422 });

  const owned = await db().query<{ id: string }>("SELECT id FROM units WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id]);
  if (!owned.rows[0]) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const blobId = await insertDocumentBlob(db(), { orgId: auth.actor.org_id, fileName: file.name || "photo", mimeType: file.type, data: buffer });
  const mediaId = await insertMedia(db(), {
    orgId: auth.actor.org_id, entityType: "unit", entityId: params.id, blobId,
    caption: typeof caption === "string" ? caption : null, uploadedBy: auth.actor.user_name,
  });
  return NextResponse.json({ id: mediaId, url: `/api/media/${mediaId}` }, { status: 201 });
});
