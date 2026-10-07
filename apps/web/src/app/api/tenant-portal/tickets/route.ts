import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { getApiAuth } from "../../../../lib/api-auth";
import { sendMaintenanceAck } from "../../../../lib/resend";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

interface TenantContext {
  id: string;
  room_number: string | null;
  full_name: string;
  org_id: string | null;
  email: string | null;
}

/* ------------------------------------------------------------------ */
/*  Helper: resolve the tenant_id + room_number from the user profile */
/* ------------------------------------------------------------------ */
async function getTenantContext(auth: NonNullable<Awaited<ReturnType<typeof getApiAuth>>>): Promise<TenantContext | null> {
  const profileR = await db().query<{ tenant_id: string | null }>(
    "SELECT tenant_id FROM profiles WHERE id = $1", [auth.actor.user_id]);
  const tenantId = profileR.rows[0]?.tenant_id ?? null;
  if (!tenantId) return null;

  const tenantR = await db().query<TenantContext>(
    "SELECT id, room_number, full_name, org_id, email FROM tenants WHERE id = $1", [tenantId]);
  return tenantR.rows[0] ?? null;
}

/**
 * GET /api/tenant-portal/tickets
 *
 * Returns maintenance tickets belonging to the logged-in tenant.
 *
 * Security: tenant-only, scoped to the signed-in tenant's own record via
 * profiles.tenant_id (keyed off auth.actor.user_id) — the same identity the
 * original Supabase-backed version used.
 */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (auth.actor.user_role !== "tenant") {
    return NextResponse.json({ error: "Tenant-only endpoint" }, { status: 403 });
  }

  try {
    const tenant = await getTenantContext(auth);
    if (!tenant) {
      return NextResponse.json(
        { error: "No linked tenant record. Contact your manager." },
        { status: 404 },
      );
    }

    const r = await db().query(
      "SELECT * FROM maintenance_tickets WHERE tenant_id = $1 ORDER BY created_at DESC", [tenant.id]);
    return NextResponse.json(r.rows);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
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

  try {
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

    const orgId = tenant.org_id ?? auth.actor.org_id ?? "";
    const { data } = await writeWithAudit({
      table: "maintenance_tickets",
      record: {
        org_id: orgId,
        tenant_id: tenant.id,
        room_number: tenant.room_number ?? "",
        issue_type: body.issue_type,
        description: body.description,
        status: "Open",
        reported_by: tenant.full_name ?? auth.actor.user_name,
        photo_url: body.photo_url || null,
      } as Record<string, unknown>,
      action: "CREATE",
      org_id: orgId,
      tenant_id: tenant.id,
      user_id: auth.actor.user_id,
      user_name: auth.actor.user_name,
      user_role: auth.actor.user_role,
    });

    if (tenant.email) {
      try {
        await sendMaintenanceAck(tenant.email, tenant.full_name, body.issue_type, data["id"] as string);
      } catch (emailErr: any) {
        console.error("Failed to send maintenance ticket ack email:", emailErr?.message);
      }
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
