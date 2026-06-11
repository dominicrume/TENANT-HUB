import { NextResponse } from "next/server";
import { getApiAuth } from "../../../../lib/api-auth";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/*  Helper: resolve the tenant_id + room_number from the user profile */
/* ------------------------------------------------------------------ */
async function getTenantContext(auth: NonNullable<Awaited<ReturnType<typeof getApiAuth>>>) {
  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", auth.actor.user_id)
    .single();

  const tenantId = (profile as Record<string, unknown> | null)?.tenant_id as string | null;
  if (!tenantId) return null;

  const { data: tenant } = await auth.supabase
    .from("tenants")
    .select("id, room_number, full_name, org_id")
    .eq("id", tenantId)
    .single();

  return tenant;
}

/**
 * GET /api/tenant-portal/tickets
 *
 * Returns maintenance tickets belonging to the logged-in tenant.
 */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (auth.actor.user_role !== "tenant") {
    return NextResponse.json({ error: "Tenant-only endpoint" }, { status: 403 });
  }

  const tenant = await getTenantContext(auth);
  if (!tenant) {
    return NextResponse.json(
      { error: "No linked tenant record. Contact your manager." },
      { status: 404 },
    );
  }

  const { data, error } = await auth.supabase
    .from("maintenance_tickets")
    .select("*")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/**
 * POST /api/tenant-portal/tickets
 *
 * Allows a tenant to create a maintenance ticket.
 * Auto-fills tenant_id, room_number, reported_by, and org_id from their profile.
 */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (auth.actor.user_role !== "tenant") {
    return NextResponse.json({ error: "Tenant-only endpoint" }, { status: 403 });
  }

  const tenant = await getTenantContext(auth);
  if (!tenant) {
    return NextResponse.json(
      { error: "No linked tenant record. Contact your manager." },
      { status: 404 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.issue_type || !body.description) {
    return NextResponse.json(
      { error: "Missing required fields: issue_type, description" },
      { status: 422 },
    );
  }

  const { data, error } = await auth.supabase
    .from("maintenance_tickets")
    .insert({
      org_id: tenant.org_id ?? auth.actor.org_id ?? "",
      tenant_id: tenant.id,
      room_number: tenant.room_number ?? "",
      issue_type: body.issue_type,
      description: body.description,
      status: "Open",
      reported_by: tenant.full_name ?? auth.actor.user_name,
      photo_url: body.photo_url || null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
