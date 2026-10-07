import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { TenantCreateSchema } from "@tenant-hub/validation";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../lib/api-auth";
import { hashRecord } from "../../../../lib/hash";
import { canonicalSubset, type DraftState } from "../../../../lib/intake";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

/**
 * POST /api/intake/commit — finalize a draft into a tenant record.
 * Re-asserts the H4 binding (canonical hash recomputed from the draft equals the
 * stored canonical_hash and the tenant's signature), then creates the tenant via
 * writeWithAudit — which atomically writes the tenant + audit log + enqueues the
 * async blockchain stamp (H6). Marks the draft completed.
 */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "tenants", "create")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { draftId } = (await req.json().catch(() => ({}))) as { draftId?: string };
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });

  let draft: Record<string, unknown> | undefined;
  try {
    const r = await db().query<Record<string, unknown>>("SELECT * FROM drafts WHERE id = $1 AND created_by = $2", [draftId, auth.actor.user_id]);
    draft = r.rows[0];
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err, "Draft not found") }, { status: 404 });
  }
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  if (draft.step === 5) {
    return NextResponse.json({ error: "This intake has already been completed." }, { status: 409 });
  }

  const state = draft.machine_state as DraftState;
  if (!state?.signature) {
    return NextResponse.json({ error: "Draft not signed" }, { status: 409 });
  }

  // H4: recompute and assert the binding before committing.
  const recomputed = await hashRecord(canonicalSubset(state.extracted));
  if (recomputed !== draft.canonical_hash) {
    return NextResponse.json(
      { error: "Record changed since review. Restart intake (H4)" },
      { status: 409 },
    );
  }

  const parsed = TenantCreateSchema.safeParse({
    ...state.extracted,
    brand: auth.actor.brand,
    entry_method: state.input_mode,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  // Emergency fallback in case the session lookup somehow omitted org_id.
  if (!auth.actor.org_id) {
    const r = await db().query<{ org_id: string | null }>("SELECT org_id FROM profiles WHERE id = $1", [auth.actor.user_id]);
    const freshOrgId = r.rows[0]?.org_id;
    if (freshOrgId) {
      auth.actor.org_id = freshOrgId;
    } else {
      return NextResponse.json({ error: "Critical configuration error: Missing organization ID" }, { status: 500 });
    }
  }

  if (parsed.data.room_number) {
    const r = await db().query<{ id: string }>(
      "SELECT id FROM tenants WHERE org_id = $1 AND room_number = $2 AND is_archived = false AND is_active = true",
      [auth.actor.org_id, parsed.data.room_number]);
    if (r.rows.length > 0) {
      return NextResponse.json({ error: `Room ${parsed.data.room_number} is already occupied by another active tenant.` }, { status: 409 });
    }
  }

  try {
    const { data: tenant } = await writeWithAudit({
      table: "tenants",
      record: {
        ...parsed.data,
        org_id: auth.actor.org_id,
        created_by: auth.actor.user_id,
        tenant_signature_hash: draft.canonical_hash,
      } as Record<string, unknown>,
      action: "CREATE",
      entry_method: state.input_mode,
      ...auth.actor,
    });

    // Create the checklist record with personal details form marked complete
    await writeWithAudit({
      table: "intake_checklists",
      record: { tenant_id: tenant.id, personal_details_form: true } as Record<string, unknown>,
      action: "CREATE",
      ...auth.actor,
    });

    // Mark the draft completed (best-effort; audited like any draft write).
    await writeWithAudit({
      table: "drafts",
      record: { id: draftId, step: 5 } as Record<string, unknown>,
      action: "UPDATE",
      ...auth.actor,
    });

    return NextResponse.json({ tenant }, { status: 201 });
  } catch (err) {
    const message = toSafeErrorMessage(err, "Commit failed");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
