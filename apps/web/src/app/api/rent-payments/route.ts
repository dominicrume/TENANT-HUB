import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { RentPaymentCreateSchema } from "@tenant-hub/validation";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../lib/api-auth";

/**
 * GET /api/rent-payments?tenantId=[id]
 */
export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");

  let query = auth.supabase.from("rent_payments").select("*").order("payment_date", { ascending: false });
  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** POST /api/rent-payments — record a payment */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Currently we use service_charges permission for rent payments as well
  if (!can(auth.actor.user_role, "service_charges", "create")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = RentPaymentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const { data } = await writeWithAudit({
      table: "rent_payments",
      record: { ...parsed.data, recorded_by: auth.actor.user_id } as Record<string, unknown>,
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
