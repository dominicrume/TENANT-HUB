import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { TenancyCreateSchema } from "@tenant-hub/validation";
import { withRouteHandler } from "../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../lib/safe-error";

/**
 * POST /api/tenancies — Add tenancy: link a tenant already on file to a
 * room, with rent amount and frequency.
 *
 * One active tenancy per tenant, one per room — enforced here AND by
 * partial unique indexes (migration 051), so it can't be bypassed by a
 * race or a direct write. Rule chosen 2026-10-08: Rume raised "a tenant
 * being added to two properties at once" as a real problem and asked for
 * it closed; a person lives in one room at a time, so the second attempt
 * is refused with the room they're already in, not silently allowed.
 * Moving someone is: end the old tenancy, then add the new one.
 */
export const POST = withRouteHandler({ resource: "tenancies", action: "create" }, async (req, _ctx, auth) => {
  const body = await req.json().catch(() => null);
  const parsed = TenancyCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid tenancy", issues: parsed.error.issues }, { status: 422 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  try {
    const housed = await db().query<{ reference: string; property: string }>(
      `SELECT u.reference, p.name AS property FROM tenancies ty
       JOIN units u ON u.id = ty.unit_id JOIN properties p ON p.id = u.property_id
       WHERE ty.tenant_id = $1 AND ty.status = 'active' AND ty.org_id = $2 LIMIT 1`,
      [parsed.data.tenant_id, auth.actor.org_id]);
    if (housed.rows[0]) {
      const h = housed.rows[0];
      return NextResponse.json({ error: `This tenant is already housed at ${h.property}, ${h.reference}. End that tenancy first to move them.` }, { status: 409 });
    }

    const occupied = await db().query<{ full_name: string }>(
      `SELECT t.full_name FROM tenancies ty JOIN tenants t ON t.id = ty.tenant_id
       WHERE ty.unit_id = $1 AND ty.status = 'active' AND ty.org_id = $2 LIMIT 1`,
      [parsed.data.unit_id, auth.actor.org_id]);
    if (occupied.rows[0]) {
      return NextResponse.json({ error: `This room already has an active tenancy (${occupied.rows[0].full_name}).` }, { status: 409 });
    }
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
    console.error("[tenancies:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
