import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../lib/api-handler";
import { isPlatformOwner } from "../../../../lib/user-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/platform/subscriptions — the inbox for pay-first-then-review.
 * Returns pending (needs owner action) + active (live subscriptions tied to
 * an org). Pending rows carry the customer email + tier + amount so the owner
 * knows who paid and for what before they click Approve.
 *
 * Owner-only: PLATFORM_OWNER_EMAILS allowlist. A manager with no platform
 * entitlement gets 403, same shape as every other /platform/* route.
 */
export const GET = withRouteHandler({ resource: "sessions", action: "read" }, async (_req, _ctx, auth) => {
  if (!isPlatformOwner(auth.actor)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const pending = await db().query<{
    id: string; stripe_session_id: string; customer_email: string;
    tier: string; amount_pence: number; currency: string;
    stripe_customer_id: string | null; stripe_subscription_id: string | null;
    created_at: string;
  }>(
    `SELECT id, stripe_session_id, customer_email, tier, amount_pence, currency,
            stripe_customer_id, stripe_subscription_id, created_at
       FROM pending_subscriptions
      WHERE status = 'pending'
      ORDER BY created_at DESC
      LIMIT 200`,
  );

  const active = await db().query<{
    id: string; org_id: string; org_name: string | null;
    tier: string; status: string;
    stripe_subscription_id: string; current_period_end: string | null;
    created_at: string;
  }>(
    `SELECT s.id, s.org_id, o.name AS org_name,
            s.tier, s.status, s.stripe_subscription_id,
            s.current_period_end, s.created_at
       FROM org_subscriptions s
       LEFT JOIN organisations o ON o.id = s.org_id
      ORDER BY s.created_at DESC
      LIMIT 200`,
  );

  return NextResponse.json(
    { pending: pending.rows, active: active.rows },
    { headers: { "Cache-Control": "no-store" } },
  );
});
