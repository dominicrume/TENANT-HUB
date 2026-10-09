import { NextResponse } from "next/server";
import { db, listAccessRequests, findAccessRequest, decideAccessRequest } from "@tenant-hub/db";
import { withRouteHandler } from "../../../lib/api-handler";
import { isSameOriginPost } from "../../../lib/csrf";
import { toSafeErrorMessage } from "../../../lib/safe-error";
import { issueInvite } from "../../../lib/issue-invite";
import { publicOrigin } from "../../../lib/google-oauth";

export const dynamic = "force-dynamic";

/** GET — pending requests to join THIS organisation (managers). */
export const GET = withRouteHandler({ resource: "sessions", action: "create" }, async (_req, _ctx, auth) => {
  if (!auth.actor.org_id) return NextResponse.json([]);
  return NextResponse.json(await listAccessRequests(db(), auth.actor.org_id), { headers: { "Cache-Control": "no-store" } });
});

/** POST { id, decision: "approve" | "decline" } — approving issues the invite email on the spot. */
export const POST = withRouteHandler({ resource: "sessions", action: "create" }, async (req, _ctx, auth) => {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  if (auth.actor.user_role !== "manager" && auth.actor.user_role !== "admin") return NextResponse.json({ error: "Only managers can approve access" }, { status: 403 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { id?: string; decision?: string } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const decision = body?.decision === "approve" ? "approved" : body?.decision === "decline" ? "declined" : null;
  if (!id || !decision) return NextResponse.json({ error: "id and decision are required" }, { status: 422 });

  try {
    const reqRow = await findAccessRequest(db(), { id, orgId: auth.actor.org_id });
    if (!reqRow) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    if (reqRow.status !== "pending") return NextResponse.json({ error: "Already decided" }, { status: 409 });

    let delivered: boolean | null = null;
    if (decision === "approved") {
      const r = await issueInvite({ email: reqRow.email, role: reqRow.roleWanted, orgId: auth.actor.org_id, brand: auth.actor.brand, invitedBy: auth.actor.user_id, fullName: reqRow.fullName, origin: publicOrigin(req) });
      delivered = r.delivered;
    }
    await decideAccessRequest(db(), { id, orgId: auth.actor.org_id, status: decision, decidedBy: auth.actor.user_id });
    return NextResponse.json({ ok: true, status: decision, invited: delivered });
  } catch (err) {
    console.error("[access-requests:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
