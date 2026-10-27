import { NextResponse } from "next/server";
import { db, getDocumentThumb } from "@tenant-hub/db";
import { getApiAuth } from "../../../../../lib/api-auth";
import { isUuid, blobInLandlordScope } from "../../../../../lib/files-auth";

export const dynamic = "force-dynamic";

/** GET /api/files/[blobId]/thumb — the ≤320px JPEG a grid shows. Same immutable caching as the file itself. */
export async function GET(req: Request, { params }: { params: { blobId: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id || !isUuid(params.blobId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await blobInLandlordScope(params.blobId, auth))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const t = await getDocumentThumb(db(), { id: params.blobId, orgId: auth.actor.org_id });
  if (!t) return NextResponse.json({ error: "No thumbnail" }, { status: 404 });
  const etag = t.sha256 ? `"t-${t.sha256}"` : null;
  if (etag && req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, max-age=31536000, immutable" } });
  return new NextResponse(new Uint8Array(t.data), {
    headers: { "Content-Type": "image/jpeg", "Content-Length": String(t.data.length), "Cache-Control": "private, max-age=31536000, immutable", ...(etag ? { ETag: etag } : {}) },
  });
}
