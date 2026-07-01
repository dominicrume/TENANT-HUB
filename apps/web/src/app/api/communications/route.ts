import { NextResponse } from "next/server";
import { getApiAuth } from "../../../lib/api-auth";

export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");

  let query = auth.supabase
    .from("communications")
    .select("*, tenant:tenants(full_name)")
    .eq("org_id", auth.actor.org_id)
    .order("sent_at", { ascending: false });

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !body.channel || !body.message_type || !body.content) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
  }

  // Attempt to send communication via Twilio if it's SMS
  if (body.channel.toLowerCase() === "sms" && body.to_phone) {
    const twilioClient = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
      ? require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
      : null;

    if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
      try {
        await twilioClient.messages.create({
          body: body.content,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: body.to_phone
        });
      } catch (err) {
        console.error("Twilio SMS send error:", err);
      }
    } else {
      console.warn("Twilio env vars not set. Skipping real SMS dispatch.");
    }
  }

  // Log communication in database
  const { data, error } = await auth.supabase
    .from("communications")
    .insert({
      org_id: auth.actor.org_id,
      tenant_id: body.tenant_id || null,
      channel: body.channel,
      message_type: body.message_type,
      content: body.content,
      sent_by: auth.actor.user_name
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
