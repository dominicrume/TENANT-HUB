import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { TenancyCreateSchema } from "@tenant-hub/validation";
import { withRouteHandler } from "../../../lib/api-handler";

/**
 * POST /api/tenancies — Add tenancy: pick the tenant already on file, rent
 * amount, rent frequency. A tenancy links an EXISTING tenant record to a
 * room; it never creates one — a new tenant always goes through /intake/new
 * so the compliance forms are never skipped.
 */
export const POST = withRouteHandler({ resource: "tenancies", action: "create" }, async (req, _ctx, auth) => {
  const body = await req.json().catch(() => null);
  const parsed = TenancyCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid tenancy", issues: parsed.error.issues }, { status: 422 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  try {
    const { data } = await writeWithAudit({
      table: "tenancies",
      record: { ...parsed.data, org_id: auth.actor.org_id, status: "active" } as Record<string, unknown>,
      action: "CREATE",
      org_id: auth.actor.org_id,
      tenant_id: parsed.data.tenant_id,
      ...auth.actor,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
});
