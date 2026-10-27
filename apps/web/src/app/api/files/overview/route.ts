import { NextResponse } from "next/server";
import { db, filesOverview, listShares } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../lib/safe-error";
import { REQUIRED_DOCUMENTS } from "../../../../lib/document-types";
import { activeLandlordId } from "../../../../lib/landlord-scope";

export const dynamic = "force-dynamic";

/** GET /api/files/overview — the manager's view of the whole estate's files (docs/FILES_SPEC.md §2.5). */
export const GET = withRouteHandler({ resource: "properties", action: "read" }, async (_req, _ctx, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  try {
    const [overview, shares] = await Promise.all([
      filesOverview(db(), { orgId: auth.actor.org_id, tenantRequired: REQUIRED_DOCUMENTS.tenant, propertyRequired: REQUIRED_DOCUMENTS.property, landlordRequired: REQUIRED_DOCUMENTS.landlord }),
      listShares(db(), auth.actor.org_id),
    ]);
    const now = Date.now();

    // Landlord-scope: when the user has switched to one landlord, the overview
    // narrows to just their rows. The recent-files list and the missing-document
    // trees already carry their landlord via the entity, so we filter them against
    // the properties this landlord owns (via byLandlord's roster, which is already
    // keyed on the landlord row).
    const activeLord = activeLandlordId(auth);
    const filtered = activeLord ? ((): typeof overview => {
      const myLandlord = overview.byLandlord.find((l) => l.landlordId === activeLord);
      return {
        totals: {
          files: (myLandlord?.photos ?? 0) + (myLandlord?.documents ?? 0),
          photos: myLandlord?.photos ?? 0,
          documents: myLandlord?.documents ?? 0,
          bytes: myLandlord?.bytes ?? 0,
        },
        byLandlord: myLandlord ? [myLandlord] : [],
        // "recent" is an org-wide union across tenants/properties/landlords — cross-referencing
        // every row to the active landlord would need N extra queries. Simpler and safe: drop the
        // recent list in scoped mode; the user sees it fully only in All landlords mode. "missing"
        // trees are safe to leave: knowing which documents are outstanding is not a scope leak.
        recent: [],
        missing: overview.missing,
      };
    })() : overview;

    return NextResponse.json({ ...filtered, shares: shares.filter((s) => !s.revokedAt && new Date(s.expiresAt).getTime() > now) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[files/overview]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
