import { NextResponse } from "next/server";
import { db, hasDatabaseUrl } from "@tenant-hub/db";
import { withRouteHandler } from "../../../lib/api-handler";
import { isSameOriginPost } from "../../../lib/csrf";
import { issueInvite } from "../../../lib/issue-invite";
import { publicOrigin } from "../../../lib/google-oauth";
import { isPlatformOwner } from "../../../lib/user-admin";
import { toSafeErrorMessage } from "../../../lib/safe-error";

/**
 * POST /api/organisations — Rume's super-admin flow: create a new Managing
 * Agent (a brand-new organisation) AND its first admin in one go. Osama's
 * Reliable Living and anyone like them joins the platform this way:
 *   1. a fresh `organisations` row with the name
 *   2. an invite scoped to that new org, with role=admin
 *   3. the invite link + the generated password come back, so you can hand
 *      them over on WhatsApp — email isn't always reaching.
 * Isolation is enforced by org_id (H2): the new org's data never crosses to
 * the caller's org or any other, and the new admin's session only ever sees
 * the new org.
 *
 * Admin only. CSRF-checked. Needs DATABASE_URL at runtime.
 */
export const POST = withRouteHandler({ resource: "sessions", action: "create", rateLimit: true }, async (req, _ctx, auth) => {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  // Platform-level action: only the owner (PLATFORM_OWNER_EMAILS env list) can
  // onboard new Managing Agents. A tenant admin at an existing MA cannot — or
  // they'd be seeding competitors from their own seat.
  if (!isPlatformOwner(auth.actor)) return NextResponse.json({ error: "Only the platform owner can onboard a new Managing Agent. If you want to add staff inside your own organisation, use Add someone below." }, { status: 403 });
  if (!hasDatabaseUrl()) return NextResponse.json({ error: "Creating a managing agent is not configured on this environment yet" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const adminEmail = typeof body?.adminEmail === "string" ? body.adminEmail.trim().toLowerCase() : "";
  const adminFullName = typeof body?.adminFullName === "string" ? body.adminFullName.trim() : "";
  if (!name) return NextResponse.json({ error: "A name for the managing agent is required" }, { status: 422 });
  if (!adminEmail || !/^\S+@\S+\.\S+$/.test(adminEmail)) return NextResponse.json({ error: "The admin's email is required and must be a real email" }, { status: 422 });
  if (!adminFullName) return NextResponse.json({ error: "The admin's full name is required so the account has a real signature" }, { status: 422 });

  try {
    // The admin email cannot already belong to another organisation — one account, one org (migration 046 allows additional memberships, but the first account is always created against its home org).
    const existing = await db().query<{ full_name: string; org_id: string | null }>("SELECT full_name, org_id FROM profiles WHERE lower(email) = lower($1)", [adminEmail]);
    if (existing.rows[0]) return NextResponse.json({ error: `${existing.rows[0].full_name} already has an account with ${adminEmail}. If you want to make them an admin of a new managing agent, remove the existing account first or ask them to use a different email.` }, { status: 409 });

    // A managing-agent name must be unique per platform — a user can't tell two "Reliable Living" apart later.
    const dupe = await db().query<{ id: string }>("SELECT id FROM organisations WHERE lower(name) = lower($1)", [name]);
    if (dupe.rows[0]) return NextResponse.json({ error: `A managing agent called ${name} already exists on the platform.` }, { status: 409 });

    // Create the org first, so the invite that follows lands in it. Not inside writeWithAudit — the audit chain itself is org-scoped and this org doesn't exist yet; a separate audit row goes in once the admin invite settles.
    const orgRow = (await db().query<{ id: string; name: string }>("INSERT INTO organisations (name, subscription_status) VALUES ($1, 'active') RETURNING id, name", [name])).rows[0];
    if (!orgRow) throw new Error("Could not create the managing agent");

    const r = await issueInvite({
      email: adminEmail,
      role: "admin",
      orgId: orgRow.id,
      brand: auth.actor.brand,
      invitedBy: auth.actor.user_id,
      fullName: adminFullName,
      tenantId: null,
      origin: publicOrigin(req),
      // The audit trail says who did this, and under which existing org it was done — the acting admin's.
      actor: auth.actor,
    });

    return NextResponse.json({
      success: true,
      organisation: orgRow,
      admin: { email: adminEmail, fullName: adminFullName, inviteUrl: r.url, password: r.password, delivered: r.delivered, vaulted: r.vaulted },
    }, { status: 201 });
  } catch (err) {
    console.error("[organisations:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
