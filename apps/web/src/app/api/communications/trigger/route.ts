import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { getApiAuth } from "../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

/**
 * POST /api/communications/trigger — staff-facing. The write is always
 * stamped with the signed-in staff member's own org_id; without one there is
 * no organisation to log the communication against.
 */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  try {
    const body = await req.json();
    const { type, recipient, messageBody, tenantId } = body;

    if (!type || !recipient || !messageBody) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data } = await writeWithAudit({
      table: "communications_log",
      record: {
        org_id: auth.actor.org_id,
        tenant_id: tenantId || null,
        type,
        recipient,
        body: messageBody,
        status: "sent",
        sent_at: new Date().toISOString(),
      } as Record<string, unknown>,
      action: "CREATE",
      org_id: auth.actor.org_id,
      tenant_id: tenantId || undefined,
      user_id: auth.actor.user_id,
      user_name: auth.actor.user_name,
      user_role: auth.actor.user_role,
    });

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
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
