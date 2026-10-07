import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { idCheck } from "@tenant-hub/adapters";
import { getApiAuth } from "../../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/** GET — every right-to-rent / ID check run against this tenant, newest first. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json([]);

  try {
    const r = await db().query(
      `SELECT id, provider, mode, status, detail, requested_by, created_at, updated_at
       FROM tenant_id_checks WHERE tenant_id = $1 AND org_id = $2 ORDER BY created_at DESC`,
      [params.id, auth.actor.org_id],
    );
    return NextResponse.json(r.rows);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

/**
 * POST { fullName, dateOfBirth, documentType, documentRef? } — submits a new
 * check. Always starts "pending": this only ever reports a provider's
 * outcome, it never approves or refuses a tenancy itself (H10/H11) — staff
 * read the result from GET (or trigger a refresh) and make the actual
 * right-to-rent decision themselves.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const dateOfBirth = typeof body?.dateOfBirth === "string" ? body.dateOfBirth : "";
  const documentType = typeof body?.documentType === "string" ? body.documentType : "";
  const documentRef = typeof body?.documentRef === "string" ? body.documentRef : undefined;
  if (!fullName || !dateOfBirth || !documentType) {
    return NextResponse.json({ error: "fullName, dateOfBirth and documentType are required" }, { status: 422 });
  }

  try {
    const owned = await db().query<{ id: string }>("SELECT id FROM tenants WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id]);
    if (!owned.rows[0]) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const result = await idCheck().submitCheck({ fullName, dateOfBirth, documentType, documentRef });

    const { data } = await writeWithAudit({
      table: "tenant_id_checks",
      record: {
        org_id: auth.actor.org_id,
        tenant_id: params.id,
        provider: result.source,
        provider_ref: result.data.providerRef,
        mode: result.mode,
        status: result.data.outcome,
        requested_by: auth.actor.user_name,
      } as Record<string, unknown>,
      action: "CREATE",
      org_id: auth.actor.org_id,
      tenant_id: params.id,
      user_id: auth.actor.user_id,
      user_name: auth.actor.user_name,
      user_role: auth.actor.user_role,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[tenants/[id]/id-check:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
