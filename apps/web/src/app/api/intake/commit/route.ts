import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { TenantCreateSchema } from "@tenant-hub/validation";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../lib/api-auth";
import { hashRecord } from "../../../../lib/hash";
import { canonicalSubset, type DraftState } from "../../../../lib/intake";

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

  const { data: draft, error } = await auth.supabase.from("drafts").select("*").eq("id", draftId).single();
  if (error || !draft) return NextResponse.json({ error: error?.message ?? "Draft not found" }, { status: 404 });

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
      { error: "Record changed since review — restart intake (H4)" },
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

  // Emergency fallback in case Next.js fetch cache omitted org_id from the profile
  if (!auth.actor.org_id) {
    const { data: freshProfile } = await auth.supabase
      .from("profiles")
      .select("org_id")
      .eq("id", auth.actor.user_id)
      .single();
    if (freshProfile?.org_id) {
      auth.actor.org_id = freshProfile.org_id;
    } else {
      return NextResponse.json({ error: "Critical configuration error: Missing organization ID" }, { status: 500 });
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
    const message = err instanceof Error ? err.message : "Commit failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
