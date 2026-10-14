import { NextResponse } from "next/server";
import { db, filesOverview, listShares } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../lib/safe-error";
import { REQUIRED_DOCUMENTS } from "../../../../lib/document-types";

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
    return NextResponse.json({ ...overview, shares: shares.filter((s) => !s.revokedAt && new Date(s.expiresAt).getTime() > now) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[files/overview]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
