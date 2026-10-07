import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

/**
 * POST /api/gdpr/erasure-request
 * Anonymises a tenant's Personally Identifiable Information (PII) to comply with
 * the GDPR Right to Erasure, while preserving the audit chain and referential integrity.
 */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Only managers should be able to process a GDPR erasure request (or the tenant themselves)
  // For safety, we map this to the "delete" permission on tenants.
  if (!can(auth.actor.user_role, "tenants", "delete")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { tenantId } = (await req.json().catch(() => ({}))) as { tenantId?: string };
  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  let tenant: Record<string, unknown> | undefined;
  try {
    const r = await db().query<Record<string, unknown>>("SELECT * FROM tenants WHERE id = $1 AND org_id = $2", [tenantId, auth.actor.org_id]);
    tenant = r.rows[0];
  } catch (err) {
    console.error("[gdpr/erasure-request:POST:lookup]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err, "Tenant not found") }, { status: 404 });
  }
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  try {
    // Redact Personally Identifiable Information (PII)
    const anonymisedRecord = {
      ...tenant,
      first_name: "REDACTED",
      last_name: "REDACTED",
      email: "REDACTED",
      phone: "REDACTED",
      nino: "REDACTED",
      // Date of birth is often PII, zeroing it to unix epoch or null (if schema allows)
      date_of_birth: "1970-01-01", 
      address: "REDACTED",
      next_of_kin_name: "REDACTED",
      next_of_kin_phone: "REDACTED",
      notes: "Anonymised per GDPR Right to Erasure",
    };

    // Update the record via the audited write path.
    // The previous state and the new REDACTED state are both hashed and chained.
    const { data: redactedTenant } = await writeWithAudit({
      table: "tenants",
      record: anonymisedRecord,
      action: "UPDATE",
      entry_method: "gdpr-erasure",
      ...auth.actor,
    });

    return NextResponse.json({ success: true, tenant: redactedTenant }, { status: 200 });
  } catch (err) {
    console.error("[gdpr/erasure-request:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err, "Erasure processing failed. Please try again, or tell support if it keeps happening.") }, { status: 500 });
  }
}
