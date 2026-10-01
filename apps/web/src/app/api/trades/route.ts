import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { TradeCreateSchema } from "@tenant-hub/validation";
import { withRouteHandler } from "../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../lib/safe-error";

/**
 * Trades — who a repair actually gets sent to (BUILD_PLAN C33). Grouped
 * under the "maintenance" RBAC resource, same as maintenance_tickets and
 * dispatch_jobs (packages/auth/src/rbac.test.ts's RESOURCE_TABLES), so
 * staff already have create/update here and a contractor has none.
 */
export const GET = withRouteHandler({ resource: "maintenance", action: "read" }, async (_req, _ctx, auth) => {
  const { data, error } = await auth.supabase.from("trades").select("*").order("category").order("name");
  if (error) return NextResponse.json({ error: toSafeErrorMessage(error) }, { status: 500 });
  return NextResponse.json(data ?? []);
});

export const POST = withRouteHandler({ resource: "maintenance", action: "create" }, async (req, _ctx, auth) => {
  const body = await req.json().catch(() => null);
  const parsed = TradeCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid trade", issues: parsed.error.issues }, { status: 422 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  try {
    const { data } = await writeWithAudit({
      table: "trades",
      record: { ...parsed.data, org_id: auth.actor.org_id } as Record<string, unknown>,
      action: "CREATE",
      org_id: auth.actor.org_id,
      ...auth.actor,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[trades:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
