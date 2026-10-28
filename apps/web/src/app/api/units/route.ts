import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { UnitCreateSchema } from "@tenant-hub/validation";
import { withRouteHandler } from "../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../lib/safe-error";
import { isPropertyInScope } from "../../../lib/landlord-scope";

/** POST /api/units — Add room: three fields (property, reference, class).
 *  Guarded by landlord-scope (105 / C1): a session scoped to landlord A must
 *  not be able to add rooms to landlord B's property by passing B's property_id
 *  in the body. Previously missing; a cross-landlord write would have landed
 *  silently and surfaced as a Darcy room on a Reliance-filtered page view. */
export const POST = withRouteHandler({ resource: "properties", action: "create" }, async (req, _ctx, auth) => {
  const body = await req.json().catch(() => null);
  const parsed = UnitCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid room", issues: parsed.error.issues }, { status: 422 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  // Landlord-scope guard: 404 (not 403) so URL/body-poking tells the caller
  // nothing about whether that property exists elsewhere.
  const propertyId = (parsed.data as { property_id?: string }).property_id;
  if (propertyId) {
    const inScope = await isPropertyInScope(
      (sql, params) => db().query(sql, params),
      auth,
      propertyId,
    );
    if (!inScope) return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  try {
    const { data } = await writeWithAudit({
      table: "units",
      record: { ...parsed.data, org_id: auth.actor.org_id } as Record<string, unknown>,
      action: "CREATE",
      org_id: auth.actor.org_id,
      ...auth.actor,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[units:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
