import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../lib/safe-error";
import { isTenantInScope } from "../../../../lib/landlord-scope";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/sessions/[id] — sign a session off (migration 066): the support
 * worker's signature, the tenant's, or both. Each is stamped with the time it
 * was given. A signature is never overwritten once there.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!can(auth.actor.user_role, "sessions", "create")) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as { worker_signature?: string; tenant_signature?: string } | null;
  const isPng = (s: unknown): s is string => typeof s === "string" && s.startsWith("data:image/png;base64,") && s.length < 400_000;
  if (!isPng(body?.worker_signature) && !isPng(body?.tenant_signature)) return NextResponse.json({ error: "Nothing to sign with" }, { status: 422 });

  try {
    const row = (await db().query<{ id: string; tenant_id: string; worker_signature: string | null; tenant_signature: string | null }>(
      "SELECT s.id, s.tenant_id, s.worker_signature, s.tenant_signature FROM sessions s JOIN tenants t ON t.id = s.tenant_id WHERE s.id = $1 AND t.org_id = $2", [params.id, auth.actor.org_id])).rows[0];
    if (!row) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    // Landlord-scope: 404 if this session's tenant isn't in the active landlord's portfolio.
    const inScope = await isTenantInScope((sql, p) => db().query(sql, p), auth, row.tenant_id);
    if (!inScope) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    const now = new Date().toISOString();
    const record: Record<string, unknown> = { id: row.id };
    if (isPng(body?.worker_signature) && !row.worker_signature) { record["worker_signature"] = body!.worker_signature; record["worker_signed_at"] = now; }
    if (isPng(body?.tenant_signature) && !row.tenant_signature) { record["tenant_signature"] = body!.tenant_signature; record["tenant_signed_at"] = now; }
    if (Object.keys(record).length === 1) return NextResponse.json({ error: "Already signed" }, { status: 409 });
    const { data } = await writeWithAudit({ table: "sessions", record, action: "UPDATE", tenant_id: row.tenant_id, ...auth.actor });
    return NextResponse.json(Array.isArray(data) ? data[0] : data);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
