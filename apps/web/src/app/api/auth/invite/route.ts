import { NextResponse } from "next/server";
import { inviteStaffMember } from "@tenant-hub/db";
import { getApiAuth } from "../../../../lib/api-auth";
import { z } from "zod";

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "manager", "support_worker"]),
});

export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Only managers or admins can invite new staff
  if (auth.actor.user_role !== "manager" && auth.actor.user_role !== "admin") {
    return NextResponse.json({ error: "Permission denied. Only managers or admins can invite staff." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = InviteSchema.safeParse(body);
  
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { email, role } = parsed.data;

  // Manager cannot invite admin
  if (role === "admin" && auth.actor.user_role !== "admin") {
    return NextResponse.json({ error: "Permission denied. Only admins can invite other admins." }, { status: 403 });
  }

  try {
    // 1. Send the invite via Supabase Auth Admin
    const user = await inviteStaffMember(
      email,
      role,
      auth.actor.org_id,
      auth.actor.brand,
      typeof window !== "undefined" ? `${window.location.origin}/update-password` : undefined
    );

    return NextResponse.json({ success: true, user }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to invite user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
