import { NextResponse } from "next/server";
import { withRouteHandler } from "../../../lib/api-handler";
import { createSupabaseServer } from "../../../lib/supabase-server";
import { inviteUser } from "@tenant-hub/db";

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

    await inviteUser(email, role, profile.org_id, email.split("@")[0], auth.actor.brand);

    return NextResponse.json({ success: true, message: "Invitation sent" }, { status: 200 });
  }
);
