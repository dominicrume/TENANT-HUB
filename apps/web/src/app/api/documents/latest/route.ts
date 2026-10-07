import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/documents/latest?kind=digest — the single most recent
 * system-drafted document of a given kind (e.g. owner-digest's morning
 * summary, apps/worker/src/agents/owner-digest.ts). Gated the same way as
 * /api/needs-you — this is staff console reading, not a tenant-facing route.
 */
export const GET = withRouteHandler({ resource: "tenants", action: "read" }, async (req, _ctx, auth) => {
  const kind = new URL(req.url).searchParams.get("kind");
  if (!kind) return NextResponse.json({ error: "Missing kind" }, { status: 400 });
  if (!auth.actor.org_id) return NextResponse.json(null, { headers: { "Cache-Control": "no-store" } });

  try {
    const r = await db().query<{ id: string; title: string; body: string; is_simulated: boolean; created_at: string }>(
      `SELECT id, title, body, is_simulated, created_at FROM documents
       WHERE kind = $1 AND org_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [kind, auth.actor.org_id],
    );
    return NextResponse.json(r.rows[0] ?? null, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
