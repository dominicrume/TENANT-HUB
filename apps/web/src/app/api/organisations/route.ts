import { NextResponse } from "next/server";
import { withRouteHandler } from "../../../lib/api-handler";
import { createSupabaseServer } from "../../../lib/supabase-server";
import { stripe } from "../../../lib/stripe";

export const POST = withRouteHandler(
  { resource: "sessions", action: "create", rateLimit: true }, // Using sessions as a proxy for basic auth before org exists
  async (req, _context, auth) => {
    const body = await req.json();
    const name = body.name as string;
    if (!name || name.length < 3) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }

    const supabase = createSupabaseServer(); // Use admin/service role to create org if RLS is strict

    // 1. Create Stripe Customer
    const customer = await stripe.customers.create({
      name,
      email: auth.actor.user_id + "@tenant-hub.invalid", // Placeholder for actual user email
    });

    // 2. Create Organisation
    const { data: org, error } = await supabase
      .from("organisations")
      .insert({
        name,
        stripe_customer_id: customer.id,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // 3. Update user profile
    await supabase
      .from("profiles")
      .update({ org_id: org.id })
      .eq("id", auth.actor.user_id);

    return NextResponse.json(org, { status: 201 });
  }
);
