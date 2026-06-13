import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../lib/api-auth";

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

  const { data: tenant, error } = await auth.supabase
    .from("tenants")
    .select("*")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) {
    return NextResponse.json({ error: error?.message ?? "Tenant not found" }, { status: 404 });
  }

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
    const message = err instanceof Error ? err.message : "Erasure processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
