import { NextResponse } from "next/server";
import { db, getDocumentBlob } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/** GET /api/property-documents/[id]/file — streams a property document's bytes. */
export const GET = withRouteHandler({ resource: "properties", action: "read" }, async (req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const docR = await db().query<{ blob_id: string | null }>(
      "SELECT blob_id FROM property_documents WHERE id = $1 AND org_id = $2",
      [params.id, auth.actor.org_id],
    );
    const blobId = docR.rows[0]?.blob_id;
    if (!blobId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const blob = await getDocumentBlob(db(), { id: blobId, orgId: auth.actor.org_id });
    if (!blob) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const forceDownload = new URL(req.url).searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(blob.data), {
      headers: {
        "Content-Type": blob.mimeType,
        "Content-Length": String(blob.data.length),
        "Content-Disposition": `${forceDownload ? "attachment" : "inline"}; filename="${blob.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
