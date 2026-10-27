import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { getApiAuth } from "../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../lib/safe-error";
import { landlordScope, isTenantInScope } from "../../../lib/landlord-scope";

/**
 * GET /api/communications — staff-facing. Scoped to the signed-in staff
 * member's own organisation (org_id); an empty org means an empty list,
 * never every org's communications.
 */
export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json([]);

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");

  try {
    const params: unknown[] = [auth.actor.org_id];
    let sql = `SELECT c.*, t.full_name AS tenant_full_name
               FROM communications c
               LEFT JOIN tenants t ON t.id = c.tenant_id
               WHERE c.org_id = $1`;
    if (tenantId) {
      params.push(tenantId);
      sql += ` AND c.tenant_id = $${params.length}`;
    }
    // Landlord-scope: communications without a tenant can't be scoped. While a
    // landlord is active, drop the untied ones — they belong to the all-landlord view.
    const scope = landlordScope(auth, "viaTenant", { col: "c.tenant_id", paramIndex: params.length + 1 });
    sql += scope.sql;
    params.push(...scope.params);
    sql += ` ORDER BY c.sent_at DESC`;

    const r = await db().query<Record<string, unknown>>(sql, params);
    const data = r.rows.map(({ tenant_full_name, ...rest }) => ({
      ...rest,
      tenant: tenant_full_name ? { full_name: tenant_full_name } : null,
    }));
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || !body.channel || !body.message_type || !body.content) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
  }
  // The table only accepts these exact values; say so in words instead of failing deep inside the write.
  const CHANNELS: Record<string, string> = { email: "Email", sms: "SMS" };
  const TYPES: Record<string, string> = { "arrears reminder": "Arrears Reminder", "missing intake form": "Missing Intake Form", "general update": "General Update", general: "General Update" };
  const channel = CHANNELS[String(body.channel).trim().toLowerCase()];
  const messageType = TYPES[String(body.message_type).trim().toLowerCase()];
  if (!channel) return NextResponse.json({ error: "Channel must be Email or SMS" }, { status: 422 });
  if (!messageType) return NextResponse.json({ error: "Message type must be Arrears Reminder, Missing Intake Form or General Update" }, { status: 422 });
  body.channel = channel; body.message_type = messageType;

  // Landlord-scope write guard: a communication tied to a tenant must stay in-portfolio.
  if (body.tenant_id) {
    const inScope = await isTenantInScope((sql, p) => db().query(sql, p), auth, body.tenant_id);
    if (!inScope) return NextResponse.json({ error: "That tenant is not in your active landlord's portfolio." }, { status: 403 });
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

  try {
    const { data } = await writeWithAudit({
      table: "communications",
      record: {
        org_id: auth.actor.org_id,
        tenant_id: body.tenant_id || null,
        channel: body.channel,
        message_type: body.message_type,
        content: body.content,
        sent_by: auth.actor.user_name,
      } as Record<string, unknown>,
      action: "CREATE",
      org_id: auth.actor.org_id,
      tenant_id: body.tenant_id || undefined,
      user_id: auth.actor.user_id,
      user_name: auth.actor.user_name,
      user_role: auth.actor.user_role,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[communications:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
