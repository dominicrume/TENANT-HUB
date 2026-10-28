import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../../../lib/api-handler";
import { isPlatformOwner } from "../../../../../../lib/user-admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/platform/subscriptions/[id]/mark-approved — once the owner has
 * manually created the org and sent the invite via the existing Platform
 * Console flow, this flips the pending row to `approved` so it drops out of
 * the inbox. Takes an optional { orgId } so the pending row remembers which
 * org it was approved into (useful later for the auto-provision commit).
 *
 * This is intentionally hands-off in commit 100: no org is created here, no
 * invite is sent here. The owner stays the gate ("the only way into the
 * system is a manager-issued invite", page.tsx carries that guard). A later
 * commit will replace this with a one-click "Approve → create org + send
 * invite" that does the full handshake atomically.
 */
export const POST = withRouteHandler({ resource: "sessions", action: "update" }, async (req, { params }: { params: { id: string } }, auth) => {
  if (!isPlatformOwner(auth.actor)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }
  const id = params.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { orgId?: string };

  const result = await db().query<{ id: string }>(
    `UPDATE pending_subscriptions
        SET status      = 'approved',
            approved_at = now(),
            approved_by = $2,
            org_id      = COALESCE($3, org_id)
      WHERE id = $1 AND status = 'pending'
      RETURNING id`,
    [id, auth.actor.user_id, body.orgId ?? null],
  );
  if (!result.rows[0]) return NextResponse.json({ error: "Not found or already handled" }, { status: 404 });
  return NextResponse.json({ ok: true });
});

/**
 * POST /api/platform/subscriptions/[id]/mark-rejected — a card was charged we
 * don't want to onboard (test, duplicate, fraud suspicion). Owner refunds the
 * subscription in Stripe dashboard; this hides the row from the pending
 * inbox and records why. The Stripe cancel is NOT done here — that's a
 * deliberate human step in Stripe's own UI so the refund decision is logged
 * on their side too.
 */
