import { NextResponse } from "next/server";
import { db, writeWithAudit, insertDocumentBlob, MAX_DOCUMENT_BYTES } from "@tenant-hub/db";
import { hashToken } from "@tenant-hub/auth";
import { toSafeErrorMessage } from "../../../../lib/safe-error";
import { emit } from "../../../../lib/webhooks";

export const dynamic = "force-dynamic";

/**
 * Landlord upload link (migration 052) — the public half of a document
 * request. The landlord clicked the button in the request email; no account,
 * no login. The token in the URL is the only credential: hashed at rest,
 * expires 14 days after the request, cleared on use.
 */
const UPLOAD_ACTOR = { user_id: "", user_name: "System · landlord-upload", user_role: "system" } as const;

interface Pending { id: string; org_id: string; document_type: string; property: string; landlord: string | null; status: string }

async function findPending(token: string): Promise<Pending | null> {
  const r = await db().query<Pending>(
    `SELECT pd.id, pd.org_id, pd.document_type, p.name AS property, l.name AS landlord, pd.status
     FROM property_documents pd
     JOIN properties p ON p.id = pd.property_id
     LEFT JOIN landlords l ON l.id = pd.requested_from_landlord_id
     WHERE pd.upload_token_hash = $1 AND pd.upload_token_expires_at > NOW()`,
    [hashToken(token)]);
  return r.rows[0] ?? null;
}

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const row = await findPending(params.token);
  if (!row) return NextResponse.json({ error: "This upload link has expired or was already used." }, { status: 410 });
  return NextResponse.json({ documentType: row.document_type, property: row.property, landlord: row.landlord, done: row.status === "received" }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const row = await findPending(params.token);
  if (!row) return NextResponse.json({ error: "This upload link has expired or was already used." }, { status: 410 });
  if (row.status === "received") return NextResponse.json({ error: "This document has already been received. Thank you." }, { status: 409 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a file to upload" }, { status: 422 });
  if (file.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: `File is too large (max ${MAX_DOCUMENT_BYTES / 1024 / 1024}MB)` }, { status: 413 });

  try {
    const blobId = await insertDocumentBlob(db(), {
      orgId: row.org_id,
      fileName: file.name || row.document_type,
      mimeType: file.type || "application/octet-stream",
      data: Buffer.from(await file.arrayBuffer()),
    });
    const { data } = await writeWithAudit({
      table: "property_documents",
      record: {
        id: row.id, blob_id: blobId, status: "received", received_at: new Date().toISOString(),
        uploaded_by: `${row.landlord ?? "Landlord"} (via link)`, upload_token_hash: null, upload_token_expires_at: null,
      } as Record<string, unknown>,
      action: "UPDATE", org_id: row.org_id, ...UPLOAD_ACTOR,
    });
    emit(row.org_id, "document.received", data as Record<string, unknown>);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[landlord-upload:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
