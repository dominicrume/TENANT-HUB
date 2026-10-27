import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { getApiAuth } from "../../../../../lib/api-auth";
import { stripe } from "../../../../../lib/stripe";
import { toSafeErrorMessage } from "../../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * POST /api/tenant-portal/rent/checkout — tenant hits "Pay rent" on /my-ledger.
 * Body: { amount: number } in POUNDS (we convert to pence for Stripe). Returns
 * `{ url }` — the client sends the browser to that URL and Stripe hosts the
 * actual card entry. On success Stripe calls /api/webhooks/stripe, which is
 * where the rent_payments row is written (never on this request path: a
 * success_url redirect is informational, the webhook is the receipt).
 *
 * Scope: tenant role only. The tenant_id is resolved from the signed-in
 * profile — never trusted from the body — so no tenant can pay against
 * another tenant's ledger from this endpoint.
 */
export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Card payments not configured on this environment yet." }, { status: 503 });
  }
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (auth.actor.user_role !== "tenant") {
    return NextResponse.json({ error: "Tenant-only endpoint" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { amount?: number | string } | null;
  const amountPounds = Number(body?.amount);
  if (!Number.isFinite(amountPounds) || amountPounds < 1) {
    return NextResponse.json({ error: "Enter an amount of £1 or more." }, { status: 422 });
  }
  // £5,000 cap per payment — a sanity bound for the hosted-checkout path. A tenant
  // with a bigger balance can pay in multiple goes; keeps a slipped-decimal typo
  // from charging a card the wrong order of magnitude.
  const amountPence = Math.round(amountPounds * 100);
  if (amountPence > 500000) {
    return NextResponse.json({ error: "That amount is too high for one payment. Try paying in smaller amounts." }, { status: 422 });
  }

  try {
    const profileR = await db().query<{ tenant_id: string | null; email: string }>(
      "SELECT tenant_id, email FROM profiles WHERE id = $1",
      [auth.actor.user_id],
    );
    const tenantId = profileR.rows[0]?.tenant_id ?? null;
    if (!tenantId) {
      return NextResponse.json({ error: "No linked tenant record. Contact your manager." }, { status: 404 });
    }

    // Resolve the tenant's org_id — the webhook needs it to tag the rent_payments
    // row with the right organisation when writeWithAudit runs.
    const tenantR = await db().query<{ org_id: string; full_name: string }>(
      "SELECT org_id, full_name FROM tenants WHERE id = $1",
      [tenantId],
    );
    const t = tenantR.rows[0];
    if (!t) return NextResponse.json({ error: "No tenant record." }, { status: 404 });

    // Prefer the public hostname the browser used — req.url behind Railway's proxy
    // reflects the internal upstream and would send Stripe to localhost on return.
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const origin = host ? `${proto}://${host}` : (req.headers.get("origin") ?? "");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "gbp",
      customer_email: profileR.rows[0]!.email,
      line_items: [{
        price_data: {
          currency: "gbp",
          product_data: { name: `Rent payment · ${t.full_name}` },
          unit_amount: amountPence,
        },
        quantity: 1,
      }],
      // Metadata is what the webhook reads. tenant_id + org_id are LOAD-BEARING:
      // the webhook has no cookie, so without these it can't attach the payment
      // to anyone. Keys are copied by Stripe into every event about this session.
      metadata: {
        tenant_id: tenantId,
        org_id: t.org_id,
        profile_id: auth.actor.user_id,
      },
      success_url: `${origin}/my-ledger?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/my-ledger?paid=0`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[tenant-portal/rent/checkout]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
