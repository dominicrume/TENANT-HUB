import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { CHECKLIST_ITEMS } from "@tenant-hub/validation";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

/** PATCH /api/intake-checklists/[id] — toggle checklist items (writeWithAudit).
 * intake_checklists has no org_id column (see the collection route) — the
 * org check goes via tenants.org_id, same join, same reasoning. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "intake_checklists", "update")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  try {
    const existingR = await db().query<{ tenant_id: string }>(
      `SELECT ic.tenant_id FROM intake_checklists ic
       JOIN tenants t ON t.id = ic.tenant_id
       WHERE ic.id = $1 AND t.org_id = $2`,
      [params.id, auth.actor.org_id],
    );
    const existing = existingR.rows[0];
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const record: Record<string, unknown> = { id: params.id };
    for (const k of CHECKLIST_ITEMS) if (k in body) record[k] = Boolean(body[k]);

    const { data } = await writeWithAudit({
      table: "intake_checklists",
      record,
      action: "UPDATE",
      org_id: auth.actor.org_id,
      tenant_id: existing.tenant_id,
      user_id: auth.actor.user_id,
      user_name: auth.actor.user_name,
      user_role: auth.actor.user_role,
    });
    return NextResponse.json(data);
  } catch (err) {
    const message = toSafeErrorMessage(err, "Unknown error");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
