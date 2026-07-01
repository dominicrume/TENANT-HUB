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

    // If SMS, actually send it via Twilio
    if (type.toLowerCase() === "sms" && recipient) {
      const twilioClient = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
        ? require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
        : null;

      if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
        try {
          await twilioClient.messages.create({
            body: messageBody,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: recipient
          });
          console.log(`[REAL SMS SENT] To: ${recipient}`);
        } catch (err) {
          console.error("Twilio SMS trigger error:", err);
        }
      } else {
        console.warn(`[SIMULATED ${type.toUpperCase()}] To: ${recipient} | Body: ${messageBody} (Twilio env missing)`);
      }
    } else {
      // Fallback or email simulation
      console.log(`[SIMULATED ${type.toUpperCase()}] To: ${recipient} | Body: ${messageBody}`);
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("Communications API Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
