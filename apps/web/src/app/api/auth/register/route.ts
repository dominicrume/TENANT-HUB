import { NextResponse } from "next/server";
import { db, hasDatabaseUrl, insertAccessRequest, hasPendingAccessRequest, listOrganisationNames, managerEmailsForOrg } from "@tenant-hub/db";
import { notifier } from "@tenant-hub/adapters";
import { isSameOriginPost } from "../../../../lib/csrf";
import { publicOrigin } from "../../../../lib/google-oauth";

export const dynamic = "force-dynamic";

const ROLES = new Set(["manager", "support_worker", "contractor"]);

/**
 * Request access (migration 055). GET lists the organisations someone can
 * ask to join (names only). POST files the request and tells that
 * organisation's managers. Nobody gets an account here — invite-only holds;
 * a manager's approval (Settings → Users → Access requests) issues the
 * invite, and THAT email creates the account.
 */
export async function GET() {
  if (!hasDatabaseUrl()) return NextResponse.json([]);
  return NextResponse.json(await listOrganisationNames(db()), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  if (!hasDatabaseUrl()) return NextResponse.json({ error: "Not configured on this environment" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { orgId?: string; fullName?: string; email?: string; phone?: string; roleWanted?: string; message?: string } | null;
  const orgId = typeof body?.orgId === "string" ? body.orgId : "";
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const roleWanted = typeof body?.roleWanted === "string" ? body.roleWanted : "";
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 1000) : "";
  if (!fullName) return NextResponse.json({ error: "Enter your name" }, { status: 422 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 422 });
  if (!ROLES.has(roleWanted)) return NextResponse.json({ error: "Pick the kind of access you need" }, { status: 422 });

  const client = db();
  const orgs = await listOrganisationNames(client);
  const org = orgs.find((o) => o.id === orgId);
  if (!org) return NextResponse.json({ error: "Pick the organisation you work with" }, { status: 422 });

  // Already a member, or already asked: say the same neutral thing either
  // way so the form can't be used to probe which emails have accounts.
  const existing = await client.query("SELECT 1 FROM profiles WHERE lower(email) = $1 AND org_id = $2", [email, orgId]);
  if ((existing.rowCount ?? 0) > 0 || (await hasPendingAccessRequest(client, { orgId, email }))) {
    return NextResponse.json({ ok: true, pending: true });
  }

  await insertAccessRequest(client, { orgId, fullName, email, phone: phone || null, roleWanted, message: message || null });

  const managers = await managerEmailsForOrg(client, orgId);
  const base = publicOrigin(req);
  await Promise.all(managers.map((to) => notifier().send({
    to, channel: "email", subject: `Access request: ${fullName} wants to join ${org.name}`,
    body: `${fullName} (${email}${phone ? `, ${phone}` : ""}) has asked for ${roleWanted.replace("_", " ")} access to ${org.name} on Tenant Hub.${message ? `\n\nThey said: "${message}"` : ""}\n\nApprove or decline under Settings → Users:\n${base}/settings`,
  }).catch(() => null)));

  return NextResponse.json({ ok: true, pending: true }, { status: 201 });
}
