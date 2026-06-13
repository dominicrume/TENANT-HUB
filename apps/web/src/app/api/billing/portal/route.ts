import { NextResponse } from "next/server";
import { getApiAuth } from "../../../../lib/api-auth";
import { stripe } from "../../../../lib/stripe";

export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Only managers can access billing
  if (auth.actor.user_role !== "manager") {
    return NextResponse.json({ error: "Permission denied. Only managers can access billing." }, { status: 403 });
  }

  // Get the org to find the stripe_customer_id
  const { data: org, error } = await auth.supabase
    .from("organisations")
    .select("stripe_customer_id")
    .eq("id", auth.actor.org_id)
    .single();

  if (error || !org?.stripe_customer_id) {
    return NextResponse.json({ error: "Organisation not found or billing not configured" }, { status: 404 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${req.headers.get("origin")}/settings`,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create billing portal session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
