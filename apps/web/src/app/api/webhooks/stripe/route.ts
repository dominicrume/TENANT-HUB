import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db, writeWithAudit } from "@tenant-hub/db";
import { stripe } from "../../../../lib/stripe";

export const dynamic = "force-dynamic";
// Stripe signs over the RAW request body — Next can't be allowed to
// parse/re-serialise JSON for us, or signature verification fails. We read
// req.text() ourselves instead.
export const runtime = "nodejs";

/**
 * POST /api/webhooks/stripe — Stripe calls here on every event about a session
 * or subscription on this account. Public (no session cookie — a webhook has
 * nothing to do with any user's browser), authenticated by Stripe's HMAC
 * signature against STRIPE_WEBHOOK_SECRET.
 *
 * Two product lines land here:
 *   · `checkout.session.completed` with mode='payment' — the tenant RENT flow
 *     from /my-ledger (099). Writes rent_payments.
 *   · `checkout.session.completed` with mode='subscription' — the SUBSCRIPTION
 *     funnel from the landing-page pricing cards (100). Writes
 *     pending_subscriptions; the platform owner later approves at
 *     /platform/subscriptions, which creates the org and sends the existing
 *     manager-issued invite.
 *   · `customer.subscription.deleted` — subscriber cancelled; marks the live
 *     org_subscriptions row cancelled.
 *   · `invoice.payment_failed` — mark the sub past_due so an admin can act.
 *
 * Idempotency: every write path keys on the Stripe id (session.id or
 * subscription.id) with a UNIQUE constraint, so Stripe's up-to-three-day retry
 * on a non-2xx can never double-write.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhooks/stripe] STRIPE_WEBHOOK_SECRET not set — refusing");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    console.error("[webhooks/stripe] signature verify failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        return await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      case "customer.subscription.deleted":
        return await handleSubscriptionCancelled(event.data.object as Stripe.Subscription);
      case "invoice.payment_failed":
        return await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      default:
        return NextResponse.json({ received: true, type: event.type, acted: false });
    }
  } catch (err) {
    console.error("[webhooks/stripe] handler failed:", event.type, err instanceof Error ? err.message : err);
    // 500 so Stripe retries — all writes are idempotent, retries are safe.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}

/** checkout.session.completed — the only entry we act on; branches on mode. */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid" && session.mode !== "subscription") {
    return NextResponse.json({ received: true, skipped: "payment_status=" + session.payment_status });
  }

  if (session.mode === "subscription") return handleSubscriptionCheckout(session);
  if (session.mode === "payment")      return handleRentPayment(session);
  return NextResponse.json({ received: true, mode: session.mode, acted: false });
}

/**
 * Tenant RENT flow (one-off). Payment Links are not used here — this is driven
 * by /api/tenant-portal/rent/checkout, which attaches tenant_id + org_id in
 * metadata. If either is missing, we refuse: a payment we can't attribute is
 * worse than a refused one.
 */
async function handleRentPayment(session: Stripe.Checkout.Session) {
  const tenantId = session.metadata?.tenant_id;
  const orgId    = session.metadata?.org_id;
  const amountTotal = session.amount_total;
  if (!tenantId || !orgId || typeof amountTotal !== "number") {
    console.error("[webhooks/stripe] rent: missing metadata/amount", { tenantId, orgId, amountTotal, sessionId: session.id });
    return NextResponse.json({ error: "Missing session metadata" }, { status: 400 });
  }

  const reference = `stripe:${session.id}`;
  const existing = await db().query<{ id: string }>(
    "SELECT id FROM rent_payments WHERE reference_note = $1 LIMIT 1", [reference],
  );
  if (existing.rows[0]) return NextResponse.json({ received: true, deduped: true });

  await writeWithAudit({
    table: "rent_payments",
    record: {
      tenant_id: tenantId,
      amount: (amountTotal / 100).toFixed(2),
      payment_type: "Card (Stripe)",
      payment_date: new Date().toISOString().slice(0, 10),
      reference_note: reference,
      recorded_by: null,
    } as Record<string, unknown>,
    action: "CREATE",
    org_id: orgId,
    tenant_id: tenantId,
    user_id: "",
    user_name: "System · stripe-webhook",
    user_role: "system",
  });

  return NextResponse.json({ received: true, kind: "rent" });
}

/**
 * SUBSCRIPTION funnel (new user, from pricing cards). We don't have an org yet
 * — the row sits in pending_subscriptions until the platform owner reviews it
 * and approves, which creates the org and sends the manager-issued invite.
 *
 * Mapping: STRIPE_PRICE_STARTER / _PROFESSIONAL / _ENTERPRISE env vars tell us
 * which tier this subscription belongs to; anything else lands as 'unknown' so
 * the row is visible for a human to resolve.
 */
async function handleSubscriptionCheckout(session: Stripe.Checkout.Session) {
  const email = session.customer_details?.email ?? session.customer_email ?? "";
  const stripeSubId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  const stripeCustId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const amountTotal = session.amount_total ?? 0;
  const currency = (session.currency ?? "gbp").toLowerCase();

  if (!email || !stripeSubId) {
    console.error("[webhooks/stripe] subscription: missing email or subscription id", { email, stripeSubId, sessionId: session.id });
    return NextResponse.json({ error: "Missing email or subscription id" }, { status: 400 });
  }

  // Fetch the subscription to read its price → map to tier.
  let tier = "unknown";
  try {
    const sub = await stripe.subscriptions.retrieve(stripeSubId);
    const priceId = sub.items.data[0]?.price?.id;
    tier = mapPriceToTier(priceId);
  } catch (err) {
    console.error("[webhooks/stripe] could not retrieve subscription", stripeSubId, err instanceof Error ? err.message : err);
  }

  // Idempotent insert — ON CONFLICT DO NOTHING on the UNIQUE session id.
  await db().query(
    `INSERT INTO pending_subscriptions
       (stripe_session_id, stripe_customer_id, stripe_subscription_id,
        customer_email, tier, amount_pence, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (stripe_session_id) DO NOTHING`,
    [session.id, stripeCustId, stripeSubId, email, tier, amountTotal, currency],
  );

  return NextResponse.json({ received: true, kind: "subscription", tier });
}

function mapPriceToTier(priceId: string | undefined): string {
  if (!priceId) return "unknown";
  if (priceId === process.env.STRIPE_PRICE_STARTER)      return "starter";
  if (priceId === process.env.STRIPE_PRICE_PROFESSIONAL) return "professional";
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE)   return "enterprise";
  return "unknown";
}

/** The customer cancelled (or we cancelled on their behalf). Mark the live sub. */
async function handleSubscriptionCancelled(sub: Stripe.Subscription) {
  await db().query(
    "UPDATE org_subscriptions SET status = 'cancelled', cancel_at = now(), updated_at = now() WHERE stripe_subscription_id = $1",
    [sub.id],
  );
  return NextResponse.json({ received: true, cancelled: sub.id });
}

/** Card declined on renewal. Mark the sub past_due so a human sees it. */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subId = (invoice as unknown as { subscription?: string }).subscription;
  if (!subId) return NextResponse.json({ received: true, skipped: "no subscription on invoice" });
  await db().query(
    "UPDATE org_subscriptions SET status = 'past_due', updated_at = now() WHERE stripe_subscription_id = $1",
    [subId],
  );
  return NextResponse.json({ received: true, pastDue: subId });
}
