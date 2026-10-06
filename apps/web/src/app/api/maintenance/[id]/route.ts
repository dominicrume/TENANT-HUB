import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { getApiAuth } from "../../../../lib/api-auth";
import { sendMaintenanceResolved } from "../../../../lib/resend";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Missing body" }, { status: 422 });
  }

  // Allow updating status and assigned_to
  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const existing = await db().query<{ org_id: string }>(
      "SELECT org_id FROM maintenance_tickets WHERE id = $1", [params.id]);
    if (!existing.rows[0] || existing.rows[0].org_id !== auth.actor.org_id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data } = await writeWithAudit({
      table: "maintenance_tickets",
      record: { id: params.id, ...updates } as Record<string, unknown>,
      action: "UPDATE",
      org_id: auth.actor.org_id,
      user_id: auth.actor.user_id,
      user_name: auth.actor.user_name,
      user_role: auth.actor.user_role,
    });

    if (updates.status === "Resolved" && data["tenant_id"]) {
      try {
        const tenant = await db().query<{ full_name: string; email: string | null }>(
          "SELECT full_name, email FROM tenants WHERE id = $1", [data["tenant_id"]]);
        const row = tenant.rows[0];
        if (row?.email) {
          await sendMaintenanceResolved(row.email, row.full_name, (data["issue_type"] as string) || "Reported Issue");
        }
      } catch (emailErr) {
        console.error("Failed to send maintenance resolution email:", emailErr instanceof Error ? emailErr.message : emailErr);
      }
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
