import { NextResponse } from "next/server";
import { db, openShare, peekShare, getDocumentBlob, getDocumentThumb } from "@tenant-hub/db";
import { hashToken } from "@tenant-hub/auth";

export const dynamic = "force-dynamic";

/**
 * Public: a shared file (docs/FILES_SPEC.md §4). ?info=1 describes it
 * without counting an open (the share page's first paint); ?thumb=1 serves
 * the thumbnail; otherwise the bytes (inline, or ?download=1). The token in
 * the URL is the whole credential; expired or revoked → 410.
 */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const url = new URL(req.url);
  const tokenHash = hashToken(params.token);
  if (url.searchParams.get("info") === "1") {
    const s = await peekShare(db(), tokenHash);
    if (!s) return NextResponse.json({ error: "This link has expired or was withdrawn." }, { status: 410 });
    return NextResponse.json({ fileName: s.fileName, mimeType: s.mimeType, size: s.size, label: s.label, expiresAt: s.expiresAt }, { headers: { "Cache-Control": "no-store" } });
  }
  if (url.searchParams.get("thumb") === "1") {
    const s = await peekShare(db(), tokenHash);
    if (!s) return NextResponse.json({ error: "Gone" }, { status: 410 });
    const t = await getDocumentThumb(db(), { id: s.blobId, orgId: s.orgId });
    if (!t) return NextResponse.json({ error: "No thumbnail" }, { status: 404 });
    return new NextResponse(new Uint8Array(t.data), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
  }
  const s = await openShare(db(), tokenHash);
  if (!s) return NextResponse.json({ error: "This link has expired or was withdrawn." }, { status: 410 });
  const blob = await getDocumentBlob(db(), { id: s.blobId, orgId: s.orgId });
  if (!blob) return NextResponse.json({ error: "Gone" }, { status: 410 });
  const download = url.searchParams.get("download") === "1";
  const safeName = blob.fileName.replace(/["\r\n]/g, "");
  return new NextResponse(new Uint8Array(blob.data), {
    headers: {
      "Content-Type": blob.mimeType, "Content-Length": String(blob.data.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex",
    },
  });
}
