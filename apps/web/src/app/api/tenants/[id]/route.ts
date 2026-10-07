import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { TenantPatchSchema } from "@tenant-hub/validation";
import { can } from "@tenant-hub/auth";
import { getApiAuth, latestAuditHash } from "../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

interface Params {
  params: { id: string };
}

/**
 * GET /api/tenants/[id] — single tenant. Scoped by org_id (packages/db),
 * replacing what Supabase RLS (org_tenants_read) used to scope implicitly.
 */
export async function GET(_req: Request, { params }: Params) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "tenants", "read")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  if (!auth.actor.org_id) return NextResponse.json({ error: "Tenant not found or access denied" }, { status: 404 });

  try {
    const r = await db().query("SELECT * FROM tenants WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id]);
    const data = r.rows[0];
    if (!data) return NextResponse.json({ error: "Tenant not found or access denied" }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

/** PATCH /api/tenants/[id] — update via writeWithAudit (H1). */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "tenants", "update")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  if (!auth.actor.org_id) return NextResponse.json({ error: "Tenant not found or access denied" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = TenantPatchSchema.safeParse({ ...body, id: params.id });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    // Confirm the tenant belongs to this organisation before anything else,
    // and fetch current NOK fields to detect changes below — replacing what
    // Supabase RLS (org_tenants_read) used to scope implicitly.
    const currentR = await db().query<{ nok_name: string | null; nok_phone: string | null }>(
      "SELECT nok_name, nok_phone FROM tenants WHERE id = $1 AND org_id = $2",
      [params.id, auth.actor.org_id],
    );
    const currentTenant = currentR.rows[0];
    if (!currentTenant) return NextResponse.json({ error: "Tenant not found or access denied" }, { status: 404 });

    if (parsed.data.room_number) {
      const { rows } = await db().query<{ count: string }>(
        `SELECT COUNT(*) FROM tenants WHERE org_id = $1 AND room_number = $2 AND id != $3 AND is_archived = false AND is_active = true`,
        [auth.actor.org_id, parsed.data.room_number, params.id],
      );
      if (Number(rows[0]?.count ?? 0) > 0) {
        return NextResponse.json({ error: `Room ${parsed.data.room_number} is already occupied by another active tenant.` }, { status: 409 });
      }
    }

    const prev = await latestAuditHash(auth.supabase, params.id);

    // Remove DB columns that don't exist yet (migration 20260623 not applied to production)
    const recordToSave = { ...(parsed.data as Record<string, unknown>) };
    delete recordToSave.hb_claim_date;
    delete recordToSave.hb_reference_number;
    delete recordToSave.hb_document_url;

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

        await writeWithAudit({
          table: "communications",
          record: {
            org_id: auth.actor.org_id,
            tenant_id: params.id,
            channel: "SMS",
            message_type: "System Alert",
            content: message,
            sent_by: "System",
          } as Record<string, unknown>,
          action: "CREATE",
          tenant_id: params.id,
          ...auth.actor,
        });
      }
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = toSafeErrorMessage(err, "Unknown error");
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
  if (!auth.actor.org_id) return NextResponse.json({ error: "Tenant not found or access denied" }, { status: 404 });

  try {
    const existing = await db().query("SELECT id FROM tenants WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id]);
    if (!existing.rows[0]) return NextResponse.json({ error: "Tenant not found or access denied" }, { status: 404 });

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
    const message = toSafeErrorMessage(err, "Unknown error");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
