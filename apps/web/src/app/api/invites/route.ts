import { NextResponse } from "next/server";
import { withRouteHandler } from "../../../lib/api-handler";
import { createSupabaseServer } from "../../../lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

const adminClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const POST = withRouteHandler(
  { resource: "sessions", action: "create", rateLimit: true }, // Using sessions as proxy for managers
  async (req, _context, auth) => {
    if (auth.actor.user_role !== "manager") {
      return NextResponse.json({ error: "Only managers can invite team members" }, { status: 403 });
    }

    const body = await req.json();
    const email = body.email as string;
    const role = body.role as string;
    
    if (!email || !role) {
      return NextResponse.json({ error: "Email and role are required" }, { status: 400 });
    }

    const supabase = createSupabaseServer();
    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", auth.actor.user_id).single();
    if (!profile?.org_id) {
      return NextResponse.json({ error: "You must belong to an organisation" }, { status: 400 });
    }

    // 1. Send invite email via Supabase Admin Auth
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email);
    if (error) throw new Error(error.message);

    // 2. Pre-create the profile with the correct org_id and role
    if (data.user) {
      await adminClient.from("profiles").insert({
        id: data.user.id,
        role: role,
        org_id: profile.org_id,
        full_name: email.split("@")[0],
        brand: auth.actor.brand,
      });
    }

    return NextResponse.json({ success: true, message: "Invitation sent" }, { status: 200 });
  }
);
