import { NextResponse } from "next/server";
import { db, getDocumentBlob, getMediaBlobId, deleteMedia } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../lib/api-handler";

export const dynamic = "force-dynamic";

/** GET — one gallery photo's bytes, inline (property and room galleries both serve through here). */
export const GET = withRouteHandler({ resource: "properties", action: "read" }, async (_req, { params }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const blobId = await getMediaBlobId(db(), { id: params.mediaId, orgId: auth.actor.org_id });
  if (!blobId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const blob = await getDocumentBlob(db(), { id: blobId, orgId: auth.actor.org_id });
  if (!blob) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(blob.data), {
    headers: {
      "Content-Type": blob.mimeType,
      "Content-Length": String(blob.data.length),
      "Content-Disposition": `inline; filename="${blob.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
});

/** DELETE — removes one photo from whichever gallery it belongs to. */
export const DELETE = withRouteHandler({ resource: "properties", action: "update" }, async (_req, { params }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  await deleteMedia(db(), { id: params.mediaId, orgId: auth.actor.org_id });
  return NextResponse.json({ success: true });
});
