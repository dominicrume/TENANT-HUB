import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { UnitCreateSchema } from "@tenant-hub/validation";
import { withRouteHandler } from "../../../lib/api-handler";

/** POST /api/units — Add room: three fields (property, reference, class). */
export const POST = withRouteHandler({ resource: "properties", action: "create" }, async (req, _ctx, auth) => {
  const body = await req.json().catch(() => null);
  const parsed = UnitCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid room", issues: parsed.error.issues }, { status: 422 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

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
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
});
