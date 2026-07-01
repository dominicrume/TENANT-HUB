import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { TenantPatchSchema } from "@tenant-hub/validation";
import { can } from "@tenant-hub/auth";
import { getApiAuth, latestAuditHash } from "../../../../lib/api-auth";

interface Params {
  params: { id: string };
}

/** GET /api/tenants/[id] — single tenant (RLS-scoped). */
export async function GET(_req: Request, { params }: Params) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "tenants", "read")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { data, error } = await auth.supabase
    .from("tenants")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Tenant not found or access denied" }, { status: 404 });

  return NextResponse.json(data);
}

/** PATCH /api/tenants/[id] — update via writeWithAudit (H1). */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "tenants", "update")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = TenantPatchSchema.safeParse({ ...body, id: params.id });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  if (parsed.data.room_number) {
    const { count } = await auth.supabase
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .eq("org_id", auth.actor.org_id)
      .eq("room_number", parsed.data.room_number)
      .neq("id", params.id)
      .eq("is_archived", false)
      .eq("is_active", true);
      
    if (count && count > 0) {
      return NextResponse.json({ error: `Room ${parsed.data.room_number} is already occupied by another active tenant.` }, { status: 409 });
    }
  }

  try {
    const prev = await latestAuditHash(auth.supabase, params.id);
    
    // Fetch current tenant to check for NOK changes
    const { data: currentTenant } = await auth.supabase
      .from("tenants")
      .select("nok_name, nok_phone")
      .eq("id", params.id)
      .single();

    // Remove DB columns that don't exist yet because the migration wasn't pushed
    const recordToSave = { ...(parsed.data as Record<string, unknown>) };
    delete recordToSave.hb_claim_date;
    delete recordToSave.hb_reference_number;
    delete recordToSave.hb_document_url;
    delete recordToSave.housing_benefit_status;

    const { data } = await writeWithAudit({
      table: "tenants",
      record: recordToSave,
      action: "UPDATE",
      prev_hash: prev,
      ...auth.actor,
    });

    // Next of Kin Alert Trigger
    if (currentTenant && ('nok_name' in parsed.data || 'nok_phone' in parsed.data)) {
      const newName = 'nok_name' in parsed.data ? parsed.data.nok_name : currentTenant.nok_name;
      const newPhone = 'nok_phone' in parsed.data ? parsed.data.nok_phone : currentTenant.nok_phone;

      const isChanged = (newName !== currentTenant.nok_name) || (newPhone !== currentTenant.nok_phone);
      
      if (isChanged && (newName || newPhone)) {
        const message = `Automated Next of Kin Alert: NOK details updated to ${newName || "Unknown"} (${newPhone || "Unknown"}).`;
        
        // Actually send via Twilio if available
        if (newPhone) {
          const twilioClient = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
            ? require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
            : null;

          if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
            try {
              await twilioClient.messages.create({
                body: message,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: newPhone
              });
              console.log(`Successfully sent NOK SMS to ${newPhone}`);
            } catch (err) {
              console.error("Twilio SMS send error for NOK alert:", err);
            }
          }
        }

        await auth.supabase.from("communications").insert({
          org_id: auth.actor.org_id,
          tenant_id: params.id,
          channel: "SMS",
          message_type: "System Alert",
          content: message,
          sent_by: "System"
        });
      }
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/tenants/[id] — soft delete (is_archived = true). Never hard delete. */
export async function DELETE(_req: Request, { params }: Params) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "tenants", "delete")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const prev = await latestAuditHash(auth.supabase, params.id);
    const { data } = await writeWithAudit({
      table: "tenants",
      record: { id: params.id, is_archived: true } as Record<string, unknown>,
      action: "DELETE",
      prev_hash: prev,
      ...auth.actor,
    });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
