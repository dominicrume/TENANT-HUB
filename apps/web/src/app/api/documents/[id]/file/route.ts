import { NextResponse } from "next/server";
import { db, getDocumentBlob } from "@tenant-hub/db";
import { getApiAuth } from "../../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/documents/[id]/file — streams a tenant document's actual bytes.
 * Same-origin, cookie-authenticated (no signed URL needed — that was a
 * Supabase Storage concept; this is just another authenticated route). Add
 * ?download=1 to force a save-as instead of opening inline in the browser.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const docR = await db().query<{ blob_id: string | null }>(
      `SELECT td.blob_id FROM tenant_documents td
       JOIN tenants t ON t.id = td.tenant_id
       WHERE td.id = $1 AND t.org_id = $2`,
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
}
