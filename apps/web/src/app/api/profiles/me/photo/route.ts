import { NextResponse } from "next/server";
import { db, writeWithAudit, insertDocumentBlob, getDocumentBlob, MAX_DOCUMENT_BYTES } from "@tenant-hub/db";
import { getApiAuth } from "../../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * The signed-in person's own profile photo (migration 055) — the "profile
 * side" of the WhatsApp-style photo experience. Same document_blobs store
 * as tenants and landlords; only ever your own.
 */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  try {
    const r = await db().query<{ photo_blob_id: string | null; org_id: string | null }>("SELECT photo_blob_id, org_id FROM profiles WHERE id = $1", [auth.actor.user_id]);
    const row = r.rows[0];
    if (!row?.photo_blob_id || !row.org_id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const blob = await getDocumentBlob(db(), { id: row.photo_blob_id, orgId: row.org_id });
    if (!blob) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(blob.data), {
      headers: { "Content-Type": blob.mimeType, "Content-Length": String(blob.data.length), "Content-Disposition": `inline; filename="${blob.fileName.replace(/"/g, "")}"`, "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a photo" }, { status: 422 });
  if (file.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: `File is too large (max ${MAX_DOCUMENT_BYTES / 1024 / 1024}MB)` }, { status: 413 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Only image files can be used as a photo" }, { status: 422 });
  try {
    // The blob is filed under the profile's HOME organisation (not the one
    // currently switched to) so it stays reachable whichever workspace is active.
    const home = (await db().query<{ org_id: string | null }>("SELECT org_id FROM profiles WHERE id = $1", [auth.actor.user_id])).rows[0]?.org_id ?? auth.actor.org_id;
    if (!home) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
    const blobId = await insertDocumentBlob(db(), { orgId: home, fileName: file.name || "photo", mimeType: file.type, data: Buffer.from(await file.arrayBuffer()) });
    await writeWithAudit({
      table: "profiles", record: { id: auth.actor.user_id, photo_blob_id: blobId } as Record<string, unknown>,
      action: "UPDATE", org_id: home, user_id: auth.actor.user_id, user_name: auth.actor.user_name, user_role: auth.actor.user_role,
    });
    return NextResponse.json({ ok: true, url: `/api/profiles/me/photo` });
  } catch (err) {
    console.error("[profiles/me/photo:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

export async function DELETE() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  try {
    await writeWithAudit({
      table: "profiles", record: { id: auth.actor.user_id, photo_blob_id: null } as Record<string, unknown>,
      action: "UPDATE", org_id: auth.actor.org_id, user_id: auth.actor.user_id, user_name: auth.actor.user_name, user_role: auth.actor.user_role,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[profiles/me/photo:DELETE]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
