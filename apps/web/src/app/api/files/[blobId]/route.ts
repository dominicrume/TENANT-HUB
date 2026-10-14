import { NextResponse } from "next/server";
import { db, getDocumentBlob, getDocumentBlobMeta } from "@tenant-hub/db";
import { getApiAuth } from "../../../../lib/api-auth";
import { isUuid } from "../../../../lib/files-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/files/[blobId] — the bytes, org-scoped, inline (?download=1 for
 * save-as). Blobs are immutable, so the SHA-256 is the ETag and the
 * browser may cache for a year: a photo opened twice costs one download
 * (docs/FILES_SPEC.md §2 "no lag"). A conditional request never touches
 * the bytes column.
 */
export async function GET(req: Request, { params }: { params: { blobId: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id || !isUuid(params.blobId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const meta = await getDocumentBlobMeta(db(), { id: params.blobId, orgId: auth.actor.org_id });
  if (!meta) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const etag = meta.sha256 ? `"${meta.sha256}"` : null;
  if (etag && req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, max-age=31536000, immutable" } });

  const blob = await getDocumentBlob(db(), { id: params.blobId, orgId: auth.actor.org_id });
  if (!blob) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1";
  const safeName = blob.fileName.replace(/["\r\n]/g, "");
  return new NextResponse(new Uint8Array(blob.data), {
    headers: {
      "Content-Type": blob.mimeType,
      "Content-Length": String(blob.data.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Cache-Control": "private, max-age=31536000, immutable",
      ...(etag ? { ETag: etag } : {}),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
