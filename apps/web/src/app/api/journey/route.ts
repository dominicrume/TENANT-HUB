import { NextResponse } from "next/server";
import { withRouteHandler } from "../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../lib/safe-error";
import { journeysForOrg } from "../../../lib/journey-server";
import { activeLandlordId } from "../../../lib/landlord-scope";

export const dynamic = "force-dynamic";

/** GET /api/journey — every active tenant's eight stations, for the dashboard ("in the morning I see where we are with each tenant"). */
export const GET = withRouteHandler({ resource: "tenants", action: "read" }, async (_req, _ctx, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ tenants: [] });
  try {
    let all = await journeysForOrg(auth.actor.org_id);
    // Landlord-scope: filter down to the active landlord's tenants.
    // Each journey row already carries landlordId resolved through the tenant's active tenancy.
    const activeLandlord = activeLandlordId(auth);
    if (activeLandlord) all = all.filter((j) => j.landlordId === activeLandlord);
    // Those with something still to do first, nearest-to-done last within that; fully done at the bottom.
    all.sort((a, b) => (a.next ? 0 : 1) - (b.next ? 0 : 1) || a.done - b.done || a.name.localeCompare(b.name));
    return NextResponse.json({ tenants: all }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
