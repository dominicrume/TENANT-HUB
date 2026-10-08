import { NextResponse } from "next/server";
import { db, writeWithAudit, insertDocumentBlob, deleteDocumentBlob, MAX_DOCUMENT_BYTES } from "@tenant-hub/db";
import { getApiAuth } from "../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../lib/safe-error";
import { looksLikePropertyDocument } from "../../../lib/document-types";

interface TenantDocRow {
  id: string;
  tenant_id: string;
  name: string;
  blob_id: string | null;
  uploaded_by: string;
  created_at: string;
}

export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json([]);

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  try {
    // tenant_documents has no org_id column of its own (supabase/migrations/014);
    // Supabase RLS scoped it via tenant_id -> tenants.org_id, so that join
    // replaces it here, and also doubles as the "does this tenant belong to
    // my org" check for the tenantId the caller supplied. Bytes are never
    // selected here — only the metadata list.
    const r = await db().query<TenantDocRow>(
      `SELECT td.id, td.tenant_id, td.name, td.blob_id, td.uploaded_by, td.created_at FROM tenant_documents td
       JOIN tenants t ON t.id = td.tenant_id
       WHERE td.tenant_id = $1 AND t.org_id = $2
       ORDER BY td.created_at DESC`,
      [tenantId, auth.actor.org_id],
    );
    return NextResponse.json(r.rows);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

/** POST multipart/form-data: tenant_id, name, file. The file's bytes live in document_blobs (045); this row only ever carries metadata. */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const tenantId = form?.get("tenant_id");
  const name = form?.get("name");
  const file = form?.get("file");
  if (typeof tenantId !== "string" || typeof name !== "string" || !name.trim() || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
  }
  if (looksLikePropertyDocument(name)) {
    return NextResponse.json({ error: `"${name.trim()}" is a property document — add it on the property's page, not the tenant's.` }, { status: 422 });
  }
  if (file.size === 0) return NextResponse.json({ error: "That file is empty" }, { status: 422 });
  if (file.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: `File is too large (max ${MAX_DOCUMENT_BYTES / 1024 / 1024}MB)` }, { status: 413 });

  try {
    const owned = await db().query<{ id: string }>(
      "SELECT id FROM tenants WHERE id = $1 AND org_id = $2",
      [tenantId, auth.actor.org_id],
    );
    if (!owned.rows[0]) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const blobId = await insertDocumentBlob(db(), {
      orgId: auth.actor.org_id,
      fileName: file.name || name,
      mimeType: file.type || "application/octet-stream",
      data: buffer,
    });

    const { data } = await writeWithAudit({
      table: "tenant_documents",
      record: {
        tenant_id: tenantId,
        name,
        blob_id: blobId,
        uploaded_by: auth.actor.user_name,
      } as Record<string, unknown>,
      action: "CREATE",
      org_id: auth.actor.org_id,
      tenant_id: tenantId,
      user_id: auth.actor.user_id,
      user_name: auth.actor.user_name,
      user_role: auth.actor.user_role,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[documents:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing document id" }, { status: 400 });

  try {
    const docR = await db().query<{ blob_id: string | null }>(
      `SELECT td.blob_id FROM tenant_documents td
       JOIN tenants t ON t.id = td.tenant_id
       WHERE td.id = $1 AND t.org_id = $2`,
      [id, auth.actor.org_id],
    );
    const doc = docR.rows[0];
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Hard delete — tenant_documents has no soft-delete column and
    // writeWithAudit only upserts, it never removes a row (pre-existing H1
    // gap on this one route, not introduced here).
    await db().query(
      "DELETE FROM tenant_documents WHERE id = $1 AND tenant_id IN (SELECT id FROM tenants WHERE org_id = $2)",
      [id, auth.actor.org_id],
    );
    if (doc.blob_id) await deleteDocumentBlob(db(), { id: doc.blob_id, orgId: auth.actor.org_id });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[documents:DELETE]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
