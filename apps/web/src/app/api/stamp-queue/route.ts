import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { getApiAuth } from "../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../lib/safe-error";

/** GET /api/stamp-queue — blockchain stamp outbox status, scoped to this org's tenants. */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json([]);

  try {
    const r = await db().query(
      `SELECT sq.* FROM stamp_queue sq JOIN tenants tn ON tn.id = sq.tenant_id
       WHERE tn.org_id = $1 ORDER BY sq.created_at DESC LIMIT 100`,
      [auth.actor.org_id]);
    return NextResponse.json(r.rows);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
