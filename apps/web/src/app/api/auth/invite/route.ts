import { NextResponse } from "next/server";
import { hasDatabaseUrl } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../lib/api-handler";
import { isSameOriginPost } from "../../../../lib/csrf";
import { issueInvite } from "../../../../lib/issue-invite";
import { publicOrigin } from "../../../../lib/google-oauth";

const ROLES = new Set(["manager", "support_worker", "contractor", "tenant"]);

/**
 * POST /api/auth/invite — a manager issues an own-session invite (BUILD_PLAN C31): the emailed link
 * carries a one-time token, and accepting it creates the account with no Supabase auth.users row
 * involved. The manager is identified with the CURRENT login (Supabase) — the two systems coexist
 * until the cutover (DECISIONS D26).
 */
export const POST = withRouteHandler({ resource: "sessions", action: "create", rateLimit: true }, async (req, _ctx, auth) => {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  if (auth.actor.user_role !== "manager") return NextResponse.json({ error: "Only managers can invite team members" }, { status: 403 });
  if (!hasDatabaseUrl()) return NextResponse.json({ error: "Own-session invites are not configured on this environment yet" }, { status: 503 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "You must belong to an organisation" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const role = typeof body?.role === "string" ? body.role : "";
  if (!email || !ROLES.has(role)) return NextResponse.json({ error: "A valid email and role are required" }, { status: 400 });

  await issueInvite({
    email, role, orgId: auth.actor.org_id, brand: auth.actor.brand, invitedBy: auth.actor.user_id,
    fullName: typeof body?.fullName === "string" ? body.fullName : null,
    tenantId: typeof body?.tenantId === "string" ? body.tenantId : null,
    origin: publicOrigin(req),
  });
  return NextResponse.json({ success: true });
});
