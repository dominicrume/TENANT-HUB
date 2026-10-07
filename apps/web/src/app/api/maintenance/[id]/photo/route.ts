import { NextResponse } from "next/server";
import { db, writeWithAudit, insertDocumentBlob, getDocumentBlob, MAX_DOCUMENT_BYTES } from "@tenant-hub/db";
import { getApiAuth } from "../../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../../lib/safe-error";

export const dynamic = "force-dynamic";

interface TicketRow {
  org_id: string;
  tenant_id: string | null;
  photo_blob_id: string | null;
}

/** Shared by the staff maintenance board and the tenant portal: a tenant may only touch their own ticket; staff may touch any ticket in their org. */
async function loadAuthorizedTicket(id: string, auth: NonNullable<Awaited<ReturnType<typeof getApiAuth>>>): Promise<TicketRow | null> {
  const r = await db().query<TicketRow>("SELECT org_id, tenant_id, photo_blob_id FROM maintenance_tickets WHERE id = $1", [id]);
  const ticket = r.rows[0];
  if (!ticket || ticket.org_id !== auth.actor.org_id) return null;

  if (auth.actor.user_role === "tenant") {
    const profileR = await db().query<{ tenant_id: string | null }>("SELECT tenant_id FROM profiles WHERE id = $1", [auth.actor.user_id]);
    if (!profileR.rows[0]?.tenant_id || profileR.rows[0].tenant_id !== ticket.tenant_id) return null;
  }
  return ticket;
}

/** GET — the ticket's photo bytes. Always inline. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const ticket = await loadAuthorizedTicket(params.id, auth);
    if (!ticket?.photo_blob_id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const blob = await getDocumentBlob(db(), { id: ticket.photo_blob_id, orgId: auth.actor.org_id });
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

/** POST multipart/form-data { file } — attaches/replaces the ticket's photo. */
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
    const ticket = await loadAuthorizedTicket(params.id, auth);
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const blobId = await insertDocumentBlob(db(), {
      orgId: auth.actor.org_id,
      fileName: file.name || "photo",
      mimeType: file.type,
      data: buffer,
    });

    const { data } = await writeWithAudit({
      table: "maintenance_tickets",
      record: { id: params.id, photo_blob_id: blobId, photo_url: `/api/maintenance/${params.id}/photo` } as Record<string, unknown>,
      action: "UPDATE",
      org_id: auth.actor.org_id,
      tenant_id: ticket.tenant_id ?? undefined,
      user_id: auth.actor.user_id,
      user_name: auth.actor.user_name,
      user_role: auth.actor.user_role,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[maintenance/[id]/photo:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
