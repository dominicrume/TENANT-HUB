import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../../../lib/api-handler";
import { isPlatformOwner } from "../../../../../../lib/user-admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/platform/subscriptions/[id]/mark-rejected — see sibling route's
 * header. The Stripe-side refund stays a deliberate human step in Stripe's
 * own dashboard; this call only hides the row from the pending inbox and
 * records the reason the owner typed in.
 */
export const POST = withRouteHandler({ resource: "sessions", action: "update" }, async (req, { params }: { params: { id: string } }, auth) => {
  if (!isPlatformOwner(auth.actor)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }
  const id = params.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = (body.reason ?? "").slice(0, 500);

  const result = await db().query<{ id: string }>(
    `UPDATE pending_subscriptions
        SET status          = 'rejected',
            rejected_at     = now(),
            rejected_reason = NULLIF($2, '')
      WHERE id = $1 AND status = 'pending'
      RETURNING id`,
    [id, reason],
  );
  if (!result.rows[0]) return NextResponse.json({ error: "Not found or already handled" }, { status: 404 });
  return NextResponse.json({ ok: true });
});
