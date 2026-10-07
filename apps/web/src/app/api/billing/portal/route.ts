import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { getApiAuth } from "../../../../lib/api-auth";
import { stripe } from "../../../../lib/stripe";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Only managers can access billing
  if (auth.actor.user_role !== "manager") {
    return NextResponse.json({ error: "Permission denied. Only managers can access billing." }, { status: 403 });
  }
  if (!auth.actor.org_id) {
    return NextResponse.json({ error: "Organisation not found or billing not configured" }, { status: 404 });
  }

  // Get the org to find the stripe_customer_id. organisations.id IS the org
  // scope here — this is the org's own row, not a row owned by some other
  // table, so the actor's own org_id in the WHERE is the whole boundary.
  const orgR = await db().query<{ stripe_customer_id: string | null }>(
    "SELECT stripe_customer_id FROM organisations WHERE id = $1",
    [auth.actor.org_id],
  );
  const org = orgR.rows[0];

  if (!org?.stripe_customer_id) {
    return NextResponse.json({ error: "Organisation not found or billing not configured" }, { status: 404 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${req.headers.get("origin")}/settings`,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err) {
    const message = toSafeErrorMessage(err, "Failed to create billing portal session");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
