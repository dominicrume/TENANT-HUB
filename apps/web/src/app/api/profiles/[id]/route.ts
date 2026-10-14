import { NextResponse } from "next/server";
import { db, writeWithAudit, deleteAllSessionsForProfile } from "@tenant-hub/db";
import { getApiAuth } from "../../../../lib/api-auth";
import { isSameOriginPost } from "../../../../lib/csrf";
import { toSafeErrorMessage } from "../../../../lib/safe-error";
import { canManageUsers, USER_ROLES } from "../../../../lib/user-admin";

export const dynamic = "force-dynamic";

/**
 * The admin's hand on the team (Matloob, 2026-10-14).
 *   PATCH  { role }  — change what someone can do (make admin, demote…)
 *   DELETE           — remove a person: their sessions end now; their name
 *                      stays on every audit row they ever wrote.
 * Guard rails: only the org's admin (or a manager while the org has no
 * admin); never yourself; never the last admin.
 */
async function guard(targetId: string) {
  const auth = await getApiAuth();
  if (!auth) return { res: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) };
  if (!auth.actor.org_id) return { res: NextResponse.json({ error: "No organisation on this account" }, { status: 400 }) };
  if (!(await canManageUsers(auth.actor))) return { res: NextResponse.json({ error: "Only the organisation's admin can change people" }, { status: 403 }) };
  const target = (await db().query<{ id: string; role: string; full_name: string; email: string | null }>("SELECT id, role, full_name, email FROM profiles WHERE id = $1 AND org_id = $2", [targetId, auth.actor.org_id])).rows[0];
  if (!target) return { res: NextResponse.json({ error: "Person not found in this organisation" }, { status: 404 }) };
  const admins = Number((await db().query<{ n: string }>("SELECT count(*) AS n FROM profiles WHERE org_id = $1 AND role = 'admin'", [auth.actor.org_id])).rows[0]?.n ?? 0);
  return { auth, target, admins };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  const g = await guard(params.id);
  if ("res" in g) return g.res;
  const body = (await req.json().catch(() => null)) as { role?: string } | null;
  const role = body?.role;
  if (!role || !(USER_ROLES as readonly string[]).includes(role)) return NextResponse.json({ error: "Pick a valid role" }, { status: 422 });
  if (g.target.id === g.auth.actor.user_id && role !== "admin") return NextResponse.json({ error: "You can't change your own role — ask another admin" }, { status: 422 });
  if (g.target.role === "admin" && role !== "admin" && g.admins <= 1) return NextResponse.json({ error: "That's the only admin. Make someone else admin first." }, { status: 422 });
  try {
    const { data } = await writeWithAudit({
      table: "profiles", record: { id: g.target.id, role } as Record<string, unknown>,
      action: "UPDATE", org_id: g.auth.actor.org_id, ...g.auth.actor,
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard(params.id);
  if ("res" in g) return g.res;
  if (g.target.id === g.auth.actor.user_id) return NextResponse.json({ error: "You can't remove yourself" }, { status: 422 });
  if (g.target.role === "admin" && g.admins <= 1) return NextResponse.json({ error: "That's the only admin. Make someone else admin first." }, { status: 422 });
  try {
    await deleteAllSessionsForProfile(db(), g.target.id);
    await db().query("DELETE FROM profiles WHERE id = $1 AND org_id = $2", [g.target.id, g.auth.actor.org_id]);
    await writeWithAudit({
      table: "documents",
      record: { org_id: g.auth.actor.org_id, kind: "user_removed", title: `Removed ${g.target.full_name} (${g.target.email ?? "no email"})`, body: `role ${g.target.role}; removed by ${g.auth.actor.user_name}`, related_table: "profiles", related_id: g.target.id } as Record<string, unknown>,
      action: "CREATE", org_id: g.auth.actor.org_id, ...g.auth.actor,
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
