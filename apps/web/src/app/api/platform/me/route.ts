import { NextResponse } from "next/server";
import { withRouteHandler } from "../../../../lib/api-handler";
import { isPlatformOwner } from "../../../../lib/user-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/platform/me — one bit for the UI: is the signed-in user the
 * platform owner? Used to hide the "Add a managing agent" card from any
 * admin who isn't on the PLATFORM_OWNER_EMAILS allowlist, so a tenant
 * admin never sees a button they can't press.
 */
export const GET = withRouteHandler({ resource: "sessions", action: "read" }, async (_req, _ctx, auth) => {
  return NextResponse.json({ isPlatformOwner: isPlatformOwner(auth.actor) }, { headers: { "Cache-Control": "no-store" } });
});
