import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { ServiceChargeCreateSchema } from "@tenant-hub/validation";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../lib/api-auth";

/**
 * GET /api/service-charges?tenantId=[id]  — charges for a tenant.
 * GET /api/service-charges?unpaid=true     — unpaid charges (dashboard total).
 */
export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");
  const unpaid = url.searchParams.get("unpaid") === "true";

  let query = auth.supabase.from("service_charges").select("*").order("due_date", { ascending: true });
  if (tenantId) query = query.eq("tenant_id", tenantId);
  if (unpaid) query = query.eq("is_paid", false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** POST /api/service-charges — add a charge week (writeWithAudit, H1). */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "service_charges", "create")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = ServiceChargeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const { data } = await writeWithAudit({
      table: "service_charges",
      record: { ...parsed.data, entered_by: auth.actor.user_id } as Record<string, unknown>,
      action: "CREATE",
      tenant_id: parsed.data.tenant_id,
      ...auth.actor,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
