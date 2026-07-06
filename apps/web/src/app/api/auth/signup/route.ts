import { NextResponse } from "next/server";
import { createSupabaseServer } from "../../../../lib/supabase-server";
import { sendWelcomeEmail } from "../../../../lib/resend";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.email || !body.password || !body.fullName || !body.role || !body.brand) {
      return NextResponse.json({ error: "Missing required signup fields" }, { status: 422 });
    }

    const { email, password, fullName, role, brand } = body;

    const supabase = createSupabaseServer();

    // Sign up via Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          brand,
        },
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Try sending welcome email via Resend
    try {
      await sendWelcomeEmail(email, fullName);
    } catch (emailErr: any) {
      console.error("Welcome email failed to send, but signup succeeded:", emailErr?.message);
    }

    return NextResponse.json({ success: true, user: data.user }, { status: 201 });
  } catch (err: any) {
    console.error("Signup API Route failed:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
