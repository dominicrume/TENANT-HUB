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
 * POST /api/webhooks/stripe — Stripe calls here on every event about a session.
 * Public (no session cookie — a tenant's phone has nothing to do with the
 * webhook), authenticated by Stripe's HMAC signature against STRIPE_WEBHOOK_SECRET.
 * Only `checkout.session.completed` triggers a write; every other event type
 * is acknowledged so Stripe stops retrying.
 *
 * Idempotency: Stripe retries a webhook up to three days if 2xx isn't returned,
 * and the "events" list on a session can fire twice legitimately. We write
 * reference_note = `stripe:<session.id>` and skip the insert when a row with
 * that reference already exists — so a replay never doubles a rent payment.
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

  if (event.type !== "checkout.session.completed") {
    // Known events we don't act on: payment_intent.succeeded, charge.refunded,
    // etc. Return 200 so Stripe marks them delivered and stops retrying.
    return NextResponse.json({ received: true, type: event.type, acted: false });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true, skipped: "payment_status=" + session.payment_status });
  }

  const tenantId = session.metadata?.tenant_id;
  const orgId = session.metadata?.org_id;
  const amountTotal = session.amount_total; // pence
  if (!tenantId || !orgId || typeof amountTotal !== "number") {
    console.error("[webhooks/stripe] missing metadata / amount:", {
      tenantId, orgId, amountTotal, sessionId: session.id,
    });
    return NextResponse.json({ error: "Missing session metadata" }, { status: 400 });
  }

  const reference = `stripe:${session.id}`;

  try {
    const existing = await db().query<{ id: string }>(
      "SELECT id FROM rent_payments WHERE reference_note = $1 LIMIT 1",
      [reference],
    );
    if (existing.rows[0]) {
      return NextResponse.json({ received: true, deduped: true });
    }

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
      // Same sentinel pattern as apps/worker agents — no human profile; the
      // audit row still records WHO (Stripe webhook) and WHAT.
      user_id: "",
      user_name: "System · stripe-webhook",
      user_role: "system",
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[webhooks/stripe] write failed:", err instanceof Error ? err.message : err);
    // 500 so Stripe retries — the write is idempotent, the retry is safe.
    return NextResponse.json({ error: "Could not record payment" }, { status: 500 });
  }
}
