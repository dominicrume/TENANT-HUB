import { NextResponse } from "next/server";
import { db, writeWithAudit, insertDocumentBlob, getDocumentBlob, MAX_DOCUMENT_BYTES } from "@tenant-hub/db";
import { getApiAuth } from "../../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/** GET — the landlord's photo bytes. Always inline (it's an avatar, not a document to save-as). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const r = await db().query<{ photo_blob_id: string | null }>(
      "SELECT photo_blob_id FROM landlords WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id]);
    const blobId = r.rows[0]?.photo_blob_id;
    if (!blobId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const blob = await getDocumentBlob(db(), { id: blobId, orgId: auth.actor.org_id });
    if (!blob) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return new NextResponse(new Uint8Array(blob.data), {
      headers: {
        "Content-Type": blob.mimeType,
        "Content-Length": String(blob.data.length),
        "Content-Disposition": `inline; filename="${blob.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

/** POST multipart/form-data { file } — replaces the landlord's photo. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 422 });
  if (file.size === 0) return NextResponse.json({ error: "That file is empty" }, { status: 422 });
  if (file.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: `File is too large (max ${MAX_DOCUMENT_BYTES / 1024 / 1024}MB)` }, { status: 413 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Only image files can be used as a photo" }, { status: 422 });

  try {
    const owned = await db().query<{ id: string }>("SELECT id FROM landlords WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id]);
    if (!owned.rows[0]) return NextResponse.json({ error: "Landlord not found" }, { status: 404 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const blobId = await insertDocumentBlob(db(), {
      orgId: auth.actor.org_id,
      fileName: file.name || "photo",
      mimeType: file.type,
      data: buffer,
    });

    const { data } = await writeWithAudit({
      table: "landlords",
      record: { id: params.id, photo_blob_id: blobId, photo_url: `/api/landlords/${params.id}/photo` } as Record<string, unknown>,
      action: "UPDATE",
      org_id: auth.actor.org_id,
      user_id: auth.actor.user_id,
      user_name: auth.actor.user_name,
      user_role: auth.actor.user_role,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[landlords/[id]/photo:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
