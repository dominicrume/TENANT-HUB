import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

/**
 * PATCH /api/service-charges/[id] — toggle paid / set paid_date (writeWithAudit).
 * Fetches the row first so the audit entry links to the right tenant, and so
 * org ownership (via the tenants join — service_charges has no org_id of its
 * own) is checked before any write.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  if (!can(auth.actor.user_role, "service_charges", "update")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const existingR = await db().query<{ tenant_id: string }>(
    `SELECT sc.tenant_id FROM service_charges sc JOIN tenants t ON t.id = sc.tenant_id WHERE sc.id = $1 AND t.org_id = $2`,
    [params.id, auth.actor.org_id],
  );
  const existing = existingR.rows[0];
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const isPaid = Boolean(body.is_paid);

  try {
    const { data } = await writeWithAudit({
      table: "service_charges",
      record: {
        id: params.id,
        is_paid: isPaid,
        paid_date: isPaid ? (body.paid_date ?? new Date().toISOString().slice(0, 10)) : null,
      } as Record<string, unknown>,
      action: "UPDATE",
      tenant_id: existing.tenant_id,
      ...auth.actor,
    });
    return NextResponse.json(data);
  } catch (err) {
    const message = toSafeErrorMessage(err, "Unknown error");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/service-charges/[id] — Delete a service charge.
 * Org ownership checked via the tenants join before the row is removed.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  if (!can(auth.actor.user_role, "service_charges", "delete")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const existingR = await db().query<{ tenant_id: string }>(
    `SELECT sc.tenant_id FROM service_charges sc JOIN tenants t ON t.id = sc.tenant_id WHERE sc.id = $1 AND t.org_id = $2`,
    [params.id, auth.actor.org_id],
  );
  if (!existingR.rows[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await db().query("DELETE FROM service_charges WHERE id = $1", [params.id]);

    // Log deletion manually to audit logs if needed, or rely on triggers.
    // For now, we'll just return success.
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = toSafeErrorMessage(err, "Unknown error");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
