import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { CertificateCreateSchema } from "@tenant-hub/validation";
import { withRouteHandler } from "../../../lib/api-handler";

/**
 * POST /api/certificates — Add certificate, from the Paperwork matrix's empty
 * or red cell. compliance-watch (apps/worker) resolves the matching alert on
 * its next run once this lands — this route only ever records the
 * certificate itself, never touches compliance_alerts directly (H3: one
 * derivation path, not two writers agreeing by convention).
 */
export const POST = withRouteHandler({ resource: "compliance", action: "create" }, async (req, _ctx, auth) => {
  const body = await req.json().catch(() => null);
  const parsed = CertificateCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid certificate", issues: parsed.error.issues }, { status: 422 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  try {
    const { data } = await writeWithAudit({
      table: "certificates",
      record: { ...parsed.data, org_id: auth.actor.org_id, created_by: auth.actor.user_id } as Record<string, unknown>,
      action: "CREATE",
      org_id: auth.actor.org_id,
      ...auth.actor,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
});
