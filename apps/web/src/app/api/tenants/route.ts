import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { TenantCreateSchema } from "@tenant-hub/validation";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../lib/api-auth";

/**
 * GET /api/tenants — active, non-archived tenants for the current user.
 * Reads via the RLS-respecting server client (D6). Returns an explicit 401
 * (never an empty 200) when unauthenticated — closing the silent-401 failure.
 * Consumed by useTenants() (single source of truth, H8).
 */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "tenants", "read")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { data, error } = await auth.supabase
    .from("tenants")
    .select("*")
    .eq("is_active", true)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/**
 * POST /api/tenants — create a tenant. Validates with TenantCreateSchema and
 * writes through packages/db writeWithAudit (H1: every write audited).
 */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "tenants", "create")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = TenantCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const { data } = await writeWithAudit({
      table: "tenants",
      record: { ...parsed.data, created_by: auth.actor.user_id } as Record<string, unknown>,
      action: "CREATE",
      entry_method: parsed.data.entry_method,
      ...auth.actor,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
