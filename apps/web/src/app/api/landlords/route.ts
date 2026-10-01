import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { LandlordCreateSchema } from "@tenant-hub/validation";
import { withRouteHandler } from "../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * Landlords — a real, addable list (BUILD_PLAN C46). Grouped under the
 * "properties" RBAC resource (packages/auth/src/rbac.test.ts's
 * RESOURCE_TABLES), same as the properties table itself.
 */
export const GET = withRouteHandler({ resource: "properties", action: "read" }, async (_req, _ctx, auth) => {
  const { data, error } = await auth.supabase.from("landlords").select("*").order("name");
  if (error) return NextResponse.json({ error: toSafeErrorMessage(error) }, { status: 500 });
  return NextResponse.json(data ?? [], { headers: { "Cache-Control": "no-store" } });
});

export const POST = withRouteHandler({ resource: "properties", action: "create" }, async (req, _ctx, auth) => {
  const body = await req.json().catch(() => null);
  const parsed = LandlordCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid landlord", issues: parsed.error.issues }, { status: 422 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  try {
    const { data } = await writeWithAudit({
      table: "landlords",
      record: { ...parsed.data, org_id: auth.actor.org_id } as Record<string, unknown>,
      action: "CREATE",
      org_id: auth.actor.org_id,
      ...auth.actor,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[landlords:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
