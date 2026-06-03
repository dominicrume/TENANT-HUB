import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../lib/api-auth";

/**
 * PATCH /api/service-charges/[id] — toggle paid / set paid_date (writeWithAudit).
 * Fetches the row first so the audit entry links to the right tenant.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "service_charges", "update")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { data: existing, error: readErr } = await auth.supabase
    .from("service_charges")
    .select("tenant_id")
    .eq("id", params.id)
    .single();
  if (readErr || !existing) {
    return NextResponse.json({ error: readErr?.message ?? "Not found" }, { status: 404 });
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
      tenant_id: existing.tenant_id as string,
      ...auth.actor,
    });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
