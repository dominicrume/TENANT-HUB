import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { can } from "@tenant-hub/auth";
import { getApiAuth, latestAuditHash } from "../../../lib/api-auth";

/**
 * POST /api/eviction — record that an eviction notice was generated for a
 * tenant. Recorded as an EXPORT audit event (H1); does not modify the tenant.
 */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Issuing an official notice is a manager-level action.
  if (!can(auth.actor.user_role, "tenants", "export")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 422 });

  try {
    const prev = await latestAuditHash(auth.supabase, body.tenantId);
    const { audit_hash } = await writeWithAudit({
      table: "tenants",
      record: {
        id: body.tenantId,
        // No field change — this is an EXPORT/issuance event, not a mutation.
      } as Record<string, unknown>,
      action: "EXPORT",
      prev_hash: prev,
      tenant_id: body.tenantId,
      ...auth.actor,
    });
    return NextResponse.json({ ok: true, audit_hash });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record notice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
