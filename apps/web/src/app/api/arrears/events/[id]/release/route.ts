import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../../../lib/safe-error";

interface ArrearsEventRow {
  id: string;
  tenant_id: string;
  stage: string;
  requires_approval: boolean;
  released_at: string | null;
}

/**
 * POST /api/arrears/events/[id]/release — a person presses "Read & send".
 *
 * The letter or brief itself was drafted by the arrears-ladder agent and
 * waits with requires_approval=true (H11: everything past the first rung).
 * This route only ever RECORDS that decision — approved_by, approved_at,
 * released_at — through writeWithAudit, with the signed-in person as the
 * real actor (never the agent sentinel). It never drafts, never rewrites,
 * and never releases something already released.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  if (!can(auth.actor.user_role, "arrears", "update")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const existingR = await db().query<ArrearsEventRow>(
    "SELECT id, tenant_id, stage, requires_approval, released_at FROM arrears_events WHERE id = $1 AND org_id = $2",
    [params.id, auth.actor.org_id],
  );
  const existing = existingR.rows[0];
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.released_at) {
    return NextResponse.json({ error: "Already sent" }, { status: 409 });
  }

  try {
    const now = new Date().toISOString();
    const { data } = await writeWithAudit({
      table: "arrears_events",
      record: { id: params.id, approved_by: auth.actor.user_id, approved_at: now, released_at: now } as Record<string, unknown>,
      action: "UPDATE",
      tenant_id: existing.tenant_id,
      ...auth.actor,
    });
    return NextResponse.json(data);
  } catch (err) {
    const message = toSafeErrorMessage(err, "Unknown error");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
