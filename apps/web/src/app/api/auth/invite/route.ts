import { NextResponse } from "next/server";
import { db, hasDatabaseUrl, createInvite, attachInviteToken } from "@tenant-hub/db";
import { generateToken, hashToken } from "@tenant-hub/auth";
import { notifier } from "@tenant-hub/adapters";
import { env } from "@tenant-hub/env";
import { withRouteHandler } from "../../../../lib/api-handler";
import { isSameOriginPost } from "../../../../lib/csrf";

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

  const client = db();
  await createInvite(client, {
    email, role, orgId: auth.actor.org_id, brand: auth.actor.brand, invitedBy: auth.actor.user_id,
    fullName: typeof body?.fullName === "string" ? body.fullName : email.split("@")[0],
    tenantId: typeof body?.tenantId === "string" ? body.tenantId : null,
  });
  const token = generateToken();
  await attachInviteToken(client, { email, tokenHash: hashToken(token) });

  const base = env.server.APP_URL ?? new URL(req.url).origin;
  await notifier().send({
    to: email, channel: "email", subject: "You've been invited to Tenant Hub",
    body: `You've been invited to join as ${role.replace("_", " ")}.\n\nSet your password here (the link works once, for 14 days):\n\n${base}/invite/${token}`,
  });
  return NextResponse.json({ success: true });
});
