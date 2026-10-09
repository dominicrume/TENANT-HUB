import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { InsurancePolicyCreateSchema } from "@tenant-hub/validation";
import { withRouteHandler } from "../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * POST /api/insurance/policies — put a property's insurance policy on file.
 * The Insurance section on the property page was a read-only "no policy on
 * file yet" with no way to add one; the insurance-renewal agent had nothing
 * to watch. This is the missing write. Still ends at a decision card (H10):
 * recording a policy never binds cover.
 */
export const POST = withRouteHandler({ resource: "insurance", action: "create" }, async (req, _ctx, auth) => {
  const body = await req.json().catch(() => null);
  const parsed = InsurancePolicyCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid policy", issues: parsed.error.issues }, { status: 422 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  try {
    const owned = await db().query<{ id: string }>("SELECT id FROM properties WHERE id = $1 AND org_id = $2", [parsed.data.property_id, auth.actor.org_id]);
    if (!owned.rows[0]) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    const { data } = await writeWithAudit({
      table: "insurance_policies",
      record: { ...parsed.data, org_id: auth.actor.org_id } as Record<string, unknown>,
      action: "CREATE", org_id: auth.actor.org_id, ...auth.actor,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[insurance/policies:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
