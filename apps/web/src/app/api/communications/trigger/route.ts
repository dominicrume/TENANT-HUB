import { NextResponse } from "next/server";
import { getApiAuth } from "../../../../lib/api-auth";
import { createSupabaseServer } from "../../../../lib/supabase-server";

export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });


  try {
    const body = await req.json();
    const { type, recipient, messageBody, tenantId } = body;

    if (!type || !recipient || !messageBody) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data, error } = await auth.supabase
      .from("communications_log")
      .insert({
        org_id: auth.actor.org_id,
        tenant_id: tenantId || null,
        type,
        recipient,
        body: messageBody,
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // TODO: In a production environment, this is where we would call the Twilio or Resend API.
    // For now, we are just logging it to the database as "sent" to simulate the automation.
    console.log(`[SIMULATED ${type.toUpperCase()}] To: ${recipient} | Body: ${messageBody}`);

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("Communications API Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
