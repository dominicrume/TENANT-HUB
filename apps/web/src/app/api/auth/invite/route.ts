import { NextResponse } from "next/server";
import { db, hasDatabaseUrl, listPendingInvites } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../lib/api-handler";
import { isSameOriginPost } from "../../../../lib/csrf";
import { issueInvite } from "../../../../lib/issue-invite";
import { publicOrigin } from "../../../../lib/google-oauth";
import { canManageUsers } from "../../../../lib/user-admin";

const ROLES = new Set(["admin", "manager", "support_worker", "contractor", "tenant"]);

/** GET /api/auth/invite — the invites still waiting to be accepted (admin). */
export const GET = withRouteHandler({ resource: "sessions", action: "create" }, async (_req, _ctx, auth) => {
  if (!(await canManageUsers(auth.actor)) || !auth.actor.org_id || !hasDatabaseUrl()) return NextResponse.json([]);
  return NextResponse.json(await listPendingInvites(db(), auth.actor.org_id), { headers: { "Cache-Control": "no-store" } });
});

/**
 * POST /api/auth/invite — the admin issues an own-session invite (BUILD_PLAN C31): a one-time
 * link that creates the account when accepted. The link is emailed AND returned, so the admin
 * can send it by WhatsApp when email can't reach the person. Re-inviting an email replaces the
 * old link.
 */
export const POST = withRouteHandler({ resource: "sessions", action: "create", rateLimit: true }, async (req, _ctx, auth) => {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  if (!(await canManageUsers(auth.actor))) return NextResponse.json({ error: "Only the organisation's admin can add people" }, { status: 403 });
  if (!hasDatabaseUrl()) return NextResponse.json({ error: "Own-session invites are not configured on this environment yet" }, { status: 503 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "You must belong to an organisation" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const role = typeof body?.role === "string" ? body.role : "";
  if (!email || !ROLES.has(role)) return NextResponse.json({ error: "A valid email and role are required" }, { status: 400 });
  // Someone who already has an account doesn't need an invite — they sign in (or reset their password).
  const existing = await db().query<{ full_name: string }>("SELECT full_name FROM profiles WHERE lower(email) = lower($1)", [email]);
  if (existing.rows[0]) return NextResponse.json({ error: `${existing.rows[0].full_name} already has an account with ${email.toLowerCase()} — they can sign in, or reset their password from the sign-in page.` }, { status: 409 });

  const r = await issueInvite({
    email, role, orgId: auth.actor.org_id, brand: auth.actor.brand, invitedBy: auth.actor.user_id,
    fullName: typeof body?.fullName === "string" ? body.fullName : null,
    tenantId: typeof body?.tenantId === "string" ? body.tenantId : null,
    origin: publicOrigin(req),
  });
  return NextResponse.json({ success: true, delivered: r.delivered, inviteUrl: r.url });
});
