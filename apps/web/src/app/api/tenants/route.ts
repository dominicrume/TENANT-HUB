import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { TenantCreateSchema } from "@tenant-hub/validation";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../lib/api-auth";
import { generateSupportPlan } from "../../../lib/generate-plan";
import { toSafeErrorMessage } from "../../../lib/safe-error";
import { emit } from "../../../lib/webhooks";

const TENANT_FIELD_LABELS: Record<string, string> = {
  title: "Title", full_name: "Full name", dob: "Date of birth", nino: "National Insurance number", nationality: "Nationality",
  mobile: "Mobile", email: "Email", address: "Address", postcode: "Postcode", room_number: "Room", moved_in: "Move-in date",
  benefit_type: "Benefit type", benefit_frequency: "Benefit frequency", benefit_amount: "Benefit amount",
};

/**
 * GET /api/tenants — active, non-archived tenants for the current user's
 * organisation. Reads via packages/db with an explicit org_id filter,
 * replacing what Supabase RLS (org_tenants_read / visible_tenant_ids())
 * used to scope implicitly. Returns an explicit 401 (never an empty 200)
 * when unauthenticated — closing the silent-401 failure. Consumed by
 * useTenants() (single source of truth, H8).
 */
export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "tenants", "read")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  if (!auth.actor.org_id) return NextResponse.json([]);

  // ?unhoused=1 — only tenants with no active tenancy anywhere. Feeds the
  // "Existing tenant" picker when adding a tenancy, so someone already in a
  // room can't be offered for a second one (the server refuses it anyway).
  const unhoused = new URL(req.url).searchParams.get("unhoused") === "1";

  try {
    const r = await db().query(
      `SELECT t.* FROM tenants t
       WHERE t.org_id = $1 AND t.is_active = true AND t.is_archived = false
         ${unhoused ? "AND NOT EXISTS (SELECT 1 FROM tenancies ty WHERE ty.tenant_id = t.id AND ty.status = 'active')" : ""}
       ORDER BY t.created_at DESC`,
      [auth.actor.org_id],
    );
    return NextResponse.json(r.rows);
  } catch (err) {
    console.error("[tenants:GET]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
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
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = TenantCreateSchema.safeParse(body);
  if (!parsed.success) {
    // Say WHICH field, in plain words — a bare Zod message ("String must
    // contain at least 5 character(s)") is what staff were shown on the
    // 2026-10-09 walkthrough and nobody could tell what it referred to.
    const first = parsed.error.issues[0];
    const key = String(first?.path?.[0] ?? "");
    const label = TENANT_FIELD_LABELS[key] ?? key.replace(/_/g, " ");
    return NextResponse.json(
      { error: first ? `${label ? `${label}: ` : ""}${first.message}` : "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  if (parsed.data.room_number) {
    const { rows } = await db().query<{ count: string }>(
      `SELECT COUNT(*) FROM tenants WHERE org_id = $1 AND room_number = $2 AND is_archived = false AND is_active = true`,
      [auth.actor.org_id, parsed.data.room_number],
    );
    if (Number(rows[0]?.count ?? 0) > 0) {
      return NextResponse.json({ error: `${parsed.data.room_number} is already occupied by another active tenant.` }, { status: 409 });
    }
  }

  try {
    const recordToInsert = {
      ...parsed.data,
      org_id: auth.actor.org_id,
      created_by: auth.actor.user_id,
    };
    
    const { data } = await writeWithAudit({
      table: "tenants",
      record: recordToInsert as Record<string, unknown>,
      action: "CREATE",
      entry_method: parsed.data.entry_method,
      ...auth.actor,
    });
    
    // Asynchronously generate Reliance Support Plan if the entry was OCR
    if (parsed.data.entry_method === "ocr" && (data as any)?.[0]?.id) {
      const tenantId = (data as any)[0].id;
      // We don't await this so it happens in the background, but we wrap it in a catch to avoid unhandled rejections
      generateSupportPlan(tenantId, recordToInsert, auth.actor, auth.supabase)
        .catch(err => console.error(`[AI Pipeline] Failed to generate support plan for OCR tenant ${tenantId}:`, err));
    }

    emit(auth.actor.org_id, "tenant.created", (Array.isArray(data) ? data[0] : data) as Record<string, unknown>);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = toSafeErrorMessage(err, "Unknown error");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
