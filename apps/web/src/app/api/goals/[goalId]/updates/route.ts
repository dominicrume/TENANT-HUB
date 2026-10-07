import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { getApiAuth } from "../../../../../lib/api-auth";
import { can } from "@tenant-hub/auth";
import { toSafeErrorMessage } from "../../../../../lib/safe-error";

interface Params {
  params: { goalId: string };
}

/**
 * POST /api/goals/[goalId]/updates — add a progress note to a goal.
 * tenant_goal_updates has no org_id/tenant_id of its own — scoped via
 * tenant_goals → tenants.org_id, 404 on mismatch, same as every other
 * record-scoped route here. Writes through writeWithAudit (H1) instead of a
 * raw insert, and resolves `entered_by` to a profile (the original
 * `users!entered_by` relationship hint pointed at auth.users, which has no
 * full_name/role — profiles is the table that actually carries them).
 */
export async function POST(req: Request, { params }: Params) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "tenants", "update")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  if (!auth.actor.org_id) return NextResponse.json({ error: "Goal not found or access denied" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || !body.comment) {
    return NextResponse.json({ error: "Missing comment" }, { status: 422 });
  }

  try {
    const goalCheck = await db().query<{ tenant_id: string }>(
      `SELECT g.tenant_id FROM tenant_goals g JOIN tenants t ON t.id = g.tenant_id WHERE g.id = $1 AND t.org_id = $2`,
      [params.goalId, auth.actor.org_id],
    );
    const goal = goalCheck.rows[0];
    if (!goal) return NextResponse.json({ error: "Goal not found or access denied" }, { status: 404 });

    const { data: inserted } = await writeWithAudit({
      table: "tenant_goal_updates",
      record: {
        goal_id: params.goalId,
        comment: body.comment,
        entered_by: auth.actor.user_id,
      } as Record<string, unknown>,
      action: "CREATE",
      tenant_id: goal.tenant_id,
      ...auth.actor,
    });

    const profileR = await db().query<{ full_name: string; role: string }>(
      "SELECT full_name, role FROM profiles WHERE id = $1",
      [auth.actor.user_id],
    );

    const data = {
      ...inserted,
      entered_by: profileR.rows[0] ?? { full_name: auth.actor.user_name, role: auth.actor.user_role },
    };

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[goals/[goalId]/updates:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
