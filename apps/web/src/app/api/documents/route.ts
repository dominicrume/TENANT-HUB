import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { getApiAuth } from "../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../lib/safe-error";

interface TenantDocRow {
  id: string;
  tenant_id: string;
  name: string;
  file_url: string;
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
    // my org" check for the tenantId the caller supplied.
    const r = await db().query<TenantDocRow>(
      `SELECT td.* FROM tenant_documents td
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

export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || !body.tenant_id || !body.name || !body.file_url) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
  }

  try {
    const owned = await db().query<{ id: string }>(
      "SELECT id FROM tenants WHERE id = $1 AND org_id = $2",
      [body.tenant_id, auth.actor.org_id],
    );
    if (!owned.rows[0]) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const { data } = await writeWithAudit({
      table: "tenant_documents",
      record: {
        tenant_id: body.tenant_id,
        name: body.name,
        file_url: body.file_url,
        uploaded_by: auth.actor.user_name,
      } as Record<string, unknown>,
      action: "CREATE",
      org_id: auth.actor.org_id,
      tenant_id: body.tenant_id,
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
    // 1. Fetch file_url to clean up storage, verifying org ownership via tenants.org_id.
    const docR = await db().query<{ file_url: string }>(
      `SELECT td.file_url FROM tenant_documents td
       JOIN tenants t ON t.id = td.tenant_id
       WHERE td.id = $1 AND t.org_id = $2`,
      [id, auth.actor.org_id],
    );
    const doc = docR.rows[0];
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (doc.file_url && auth.supabase) {
      try {
        await auth.supabase.storage.from("tenant-documents").remove([doc.file_url]);
      } catch (storageErr) {
        console.error("[documents:DELETE] storage cleanup skipped:", storageErr);
      }
    }

    // 2. Delete the database record. Note: this is a genuine hard delete, not
    // routed through writeWithAudit — tenant_documents has no soft-delete
    // column and writeWithAudit only upserts, it never removes a row. This
    // matches the pre-existing behaviour (the original Supabase version also
    // deleted with no audit row); it is a known H1 gap on this one route, not
    // something introduced here.
    await db().query(
      `DELETE FROM tenant_documents WHERE id = $1 AND tenant_id IN (SELECT id FROM tenants WHERE org_id = $2)`,
      [id, auth.actor.org_id],
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[documents:DELETE]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
