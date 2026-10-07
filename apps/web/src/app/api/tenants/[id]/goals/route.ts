import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { getApiAuth } from "../../../../../lib/api-auth";
import { can } from "@tenant-hub/auth";
import { toSafeErrorMessage } from "../../../../../lib/safe-error";

interface Params {
  params: { id: string };
}

interface GoalRow {
  id: string;
  tenant_id: string;
  area: string;
  sub_category: string;
  status: string;
  created_at: string;
  review_date: string;
}

interface GoalUpdateRow {
  id: string;
  goal_id: string;
  comment: string;
  entered_by: string;
  created_at: string;
}

interface ProfileRow {
  id: string;
  full_name: string;
  role: string;
}

/**
 * GET /api/tenants/[id]/goals — fetch goals for a tenant, each with its
 * updates nested and each update's `entered_by` resolved to a profile.
 * tenant_goals/tenant_goal_updates have no org_id column of their own — RLS
 * only ever gated this by role, never by org — so this adds the org check
 * explicitly via the tenant, same as every other tenant-scoped route here.
 */
export async function GET(_req: Request, { params }: Params) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "tenants", "read")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  if (!auth.actor.org_id) return NextResponse.json({ error: "Tenant not found or access denied" }, { status: 404 });

  try {
    const tenantCheck = await db().query("SELECT id FROM tenants WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id]);
    if (!tenantCheck.rows[0]) return NextResponse.json({ error: "Tenant not found or access denied" }, { status: 404 });

    const goalsR = await db().query<GoalRow>(
      "SELECT * FROM tenant_goals WHERE tenant_id = $1 ORDER BY created_at DESC",
      [params.id],
    );
    if (goalsR.rows.length === 0) return NextResponse.json([]);

    const goalIds = goalsR.rows.map((g) => g.id);
    const updatesR = await db().query<GoalUpdateRow>(
      "SELECT * FROM tenant_goal_updates WHERE goal_id = ANY($1::uuid[]) ORDER BY created_at ASC",
      [goalIds],
    );

    const userIds = Array.from(new Set(updatesR.rows.map((u) => u.entered_by)));
    const profileMap = new Map<string, { full_name: string; role: string }>();
    if (userIds.length > 0) {
      const profilesR = await db().query<ProfileRow>(
        "SELECT id, full_name, role FROM profiles WHERE id = ANY($1::uuid[])",
        [userIds],
      );
      profilesR.rows.forEach((p) => profileMap.set(p.id, { full_name: p.full_name, role: p.role }));
    }

    const updatesByGoal = new Map<string, Array<Omit<GoalUpdateRow, "entered_by"> & { entered_by: unknown }>>();
    for (const u of updatesR.rows) {
      const list = updatesByGoal.get(u.goal_id) ?? [];
      list.push({ ...u, entered_by: profileMap.get(u.entered_by) ?? { full_name: "Staff", role: "staff" } });
      updatesByGoal.set(u.goal_id, list);
    }

    const data = goalsR.rows.map((g) => ({ ...g, tenant_goal_updates: updatesByGoal.get(g.id) ?? [] }));
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

/**
 * POST /api/tenants/[id]/goals — create a goal (and, optionally, its first
 * update comment). Both writes now go through writeWithAudit (H1) — the
 * previous code wrote tenant_goals/tenant_goal_updates directly on the
 * (now-null) Supabase client on the theory that goals don't need audit
 * coverage, but H1 requires every written table to have it regardless.
 */
export async function POST(req: Request, { params }: Params) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "tenants", "update")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  if (!auth.actor.org_id) return NextResponse.json({ error: "Tenant not found or access denied" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || !body.area || !body.sub_category) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
  }

  try {
    const tenantCheck = await db().query("SELECT id FROM tenants WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id]);
    if (!tenantCheck.rows[0]) return NextResponse.json({ error: "Tenant not found or access denied" }, { status: 404 });

    const { data: goal } = await writeWithAudit({
      table: "tenant_goals",
      record: {
        tenant_id: params.id,
        area: body.area,
        sub_category: body.sub_category,
        status: "active",
      } as Record<string, unknown>,
      action: "CREATE",
      tenant_id: params.id,
      ...auth.actor,
    });

    if (body.initial_comment) {
      await writeWithAudit({
        table: "tenant_goal_updates",
        record: {
          goal_id: (goal as Record<string, unknown>)["id"],
          comment: body.initial_comment,
          entered_by: auth.actor.user_id,
        } as Record<string, unknown>,
        action: "CREATE",
        tenant_id: params.id,
        ...auth.actor,
      });
    }

    return NextResponse.json(goal, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
