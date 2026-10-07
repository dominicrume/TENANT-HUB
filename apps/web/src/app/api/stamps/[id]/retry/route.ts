import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { getApiAuth } from "../../../../../lib/api-auth";
import { can } from "@tenant-hub/auth";
import { toSafeErrorMessage } from "../../../../../lib/safe-error";

/**
 * POST /api/stamps/[id]/retry — manually retry a dead-letter stamp.
 * Restores a "dead_letter" row in stamp_queue back to "pending",
 * resetting the retry_count and error fields.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Only admin and manager can manage the stamp queue
  if (!can(auth.actor.user_role, "stamp_queue", "update")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { id } = params;
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  try {
    // Verify the stamp exists, is dead-letter, and belongs to this org (via its tenant).
    const fetched = await db().query<{ status: string }>(
      `SELECT sq.status FROM stamp_queue sq JOIN tenants tn ON tn.id = sq.tenant_id
       WHERE sq.id = $1 AND tn.org_id = $2`,
      [id, auth.actor.org_id]);
    const stamp = fetched.rows[0];

    if (!stamp) {
      return NextResponse.json({ error: "Stamp not found" }, { status: 404 });
    }

    if (stamp.status !== "dead_letter") {
      return NextResponse.json({ error: `Cannot retry stamp with status: ${stamp.status}` }, { status: 400 });
    }

    await db().query(
      "UPDATE stamp_queue SET status = 'pending', retry_count = 0, next_retry_at = NULL, error = NULL WHERE id = $1",
      [id]);

    return NextResponse.json({ success: true, message: "Stamp enqueued for retry" });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
