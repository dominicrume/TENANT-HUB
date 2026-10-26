import { NextResponse } from "next/server";
import { db, hasDatabaseUrl, setPasswordHash, writeWithAudit } from "@tenant-hub/db";
import { hashPassword } from "@tenant-hub/auth";
import { isSameOriginPost } from "../../../../../lib/csrf";
import { withRouteHandler } from "../../../../../lib/api-handler";
import { isPlatformOwner, platformOwnerEmails } from "../../../../../lib/user-admin";
import { toSafeErrorMessage } from "../../../../../lib/safe-error";
import { generatePassword } from "../../../../../lib/vault";

export const dynamic = "force-dynamic";

/**
 * Platform-owner-only operations on a single profile anywhere on the platform:
 *   PATCH  — change the email (fixes typo signups like `.co.un` → `.co.uk`).
 *   DELETE — remove the profile. If it's the sole admin of its organisation
 *            the whole org drops with it; otherwise just this profile is
 *            removed. Both branches use `SET LOCAL session_replication_role
 *            = 'replica'` so FK triggers never block the delete.
 * The POST body-less reset lives at /password below.
 */
export const PATCH = withRouteHandler({ resource: "sessions", action: "update", rateLimit: true }, async (req, { params }: { params: { id: string } }, auth) => {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  if (!isPlatformOwner(auth.actor)) return NextResponse.json({ error: "Only the platform owner can change email on another organisation's profile." }, { status: 403 });
  if (!hasDatabaseUrl()) return NextResponse.json({ error: "Not configured on this environment yet" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const nextEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!nextEmail || !/^\S+@\S+\.\S+$/.test(nextEmail)) return NextResponse.json({ error: "A valid email is required." }, { status: 422 });

  try {
    const prof = await db().query<{ id: string; full_name: string; email: string; org_id: string | null }>("SELECT id, full_name, email, org_id FROM profiles WHERE id = $1", [params.id]);
    if (!prof.rows[0]) return NextResponse.json({ error: "No profile with that id." }, { status: 404 });
    if (prof.rows[0].email.toLowerCase() === nextEmail) return NextResponse.json({ success: true, unchanged: true });

    const clash = await db().query("SELECT full_name FROM profiles WHERE lower(email) = $1 AND id <> $2", [nextEmail, params.id]);
    if (clash.rows[0]) return NextResponse.json({ error: `"${nextEmail}" already belongs to ${clash.rows[0].full_name}.` }, { status: 409 });

    await db().query("BEGIN");
    await db().query("UPDATE profiles SET email = $1, updated_at = NOW() WHERE id = $2", [nextEmail, params.id]);
    await db().query("UPDATE issued_credentials SET email = $1 WHERE profile_id = $2", [nextEmail, params.id]).catch(() => {});
    await db().query("COMMIT");
    await writeWithAudit({
      table: "profiles", record: { id: params.id, email: nextEmail } as Record<string, unknown>, action: "UPDATE",
      org_id: prof.rows[0].org_id ?? auth.actor.org_id ?? "00000000-0000-0000-0000-000000000000",
      ...auth.actor,
    }).catch(() => {});

    return NextResponse.json({ success: true, from: prof.rows[0].email, to: nextEmail });
  } catch (err) {
    await db().query("ROLLBACK").catch(() => {});
    console.error("[platform/profiles PATCH]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});

export const DELETE = withRouteHandler({ resource: "sessions", action: "delete", rateLimit: true }, async (req, { params }: { params: { id: string } }, auth) => {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  if (!isPlatformOwner(auth.actor)) return NextResponse.json({ error: "Only the platform owner can delete another organisation's profile." }, { status: 403 });
  if (!hasDatabaseUrl()) return NextResponse.json({ error: "Not configured on this environment yet" }, { status: 503 });
  if (params.id === auth.actor.user_id) return NextResponse.json({ error: "You can't delete your own account from here — ask another platform owner, or use scripts/delete-account-by-email.mjs." }, { status: 400 });

  try {
    const prof = await db().query<{ id: string; full_name: string; email: string; org_id: string | null }>("SELECT id, full_name, email, org_id FROM profiles WHERE id = $1", [params.id]);
    if (!prof.rows[0]) return NextResponse.json({ error: "No profile with that id." }, { status: 404 });

    // Anti-footgun: refuse to delete the last account whose email is on PLATFORM_OWNER_EMAILS.
    // Without one, nobody can onboard new Managing Agents through the UI any more.
    const owners = platformOwnerEmails();
    if (owners.includes(prof.rows[0].email.toLowerCase())) {
      const r = await db().query<{ n: string }>(
        `SELECT count(*)::int AS n FROM profiles WHERE lower(email) = ANY($1::text[]) AND id <> $2`,
        [owners, params.id]
      );
      if (Number(r.rows[0]?.n ?? 0) === 0) {
        return NextResponse.json({ error: "Refusing: this is the last platform owner account on the platform. Add another owner to PLATFORM_OWNER_EMAILS first; otherwise nobody will be able to onboard new Managing Agents." }, { status: 409 });
      }
    }

    const orgId = prof.rows[0].org_id;
    let wipedOrg: { id: string; name: string } | null = null;

    if (orgId) {
      const others = await db().query<{ n: string }>("SELECT count(*)::int AS n FROM profiles WHERE org_id = $1 AND id <> $2", [orgId, params.id]);
      if (Number(others.rows[0]?.n ?? 0) === 0) {
        const orgRow = (await db().query<{ id: string; name: string }>("SELECT id, name FROM organisations WHERE id = $1", [orgId])).rows[0];
        await db().query("BEGIN");
        await db().query("SET LOCAL session_replication_role = 'replica'");
        await db().query("DELETE FROM profiles WHERE org_id = $1", [orgId]);
        await db().query("DELETE FROM tenants  WHERE org_id = $1", [orgId]);
        await db().query("DELETE FROM organisations WHERE id = $1", [orgId]);
        await db().query("COMMIT");
        wipedOrg = orgRow ?? null;
      } else {
        await db().query("BEGIN");
        await db().query("SET LOCAL session_replication_role = 'replica'");
        await db().query("DELETE FROM profiles WHERE id = $1", [params.id]);
        await db().query("COMMIT");
      }
    } else {
      await db().query("DELETE FROM profiles WHERE id = $1", [params.id]);
    }

    return NextResponse.json({ success: true, wipedProfile: prof.rows[0].full_name, wipedOrg });
  } catch (err) {
    await db().query("ROLLBACK").catch(() => {});
    console.error("[platform/profiles DELETE]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});

/** POST /api/platform/profiles/[id] — issue the profile a new password; the old one dies everywhere. */
export const POST = withRouteHandler({ resource: "sessions", action: "update", rateLimit: true }, async (req, { params }: { params: { id: string } }, auth) => {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  if (!isPlatformOwner(auth.actor)) return NextResponse.json({ error: "Only the platform owner can reset another organisation's password." }, { status: 403 });
  if (!hasDatabaseUrl()) return NextResponse.json({ error: "Not configured on this environment yet" }, { status: 503 });

  try {
    const prof = await db().query<{ id: string; email: string; full_name: string }>("SELECT id, email, full_name FROM profiles WHERE id = $1", [params.id]);
    if (!prof.rows[0]) return NextResponse.json({ error: "No profile with that id." }, { status: 404 });

    const password = generatePassword();
    await setPasswordHash(db(), params.id, await hashPassword(password));
    await db().query("DELETE FROM user_sessions WHERE profile_id = $1", [params.id]).catch(() => {});

    return NextResponse.json({ success: true, email: prof.rows[0].email, fullName: prof.rows[0].full_name, password });
  } catch (err) {
    console.error("[platform/profiles POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
