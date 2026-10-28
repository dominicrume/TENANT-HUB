import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { TenantCreateSchema } from "@tenant-hub/validation";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../lib/api-auth";
import { hashRecord } from "../../../../lib/hash";
import { canonicalSubset, type DraftState } from "../../../../lib/intake";
import { toSafeErrorMessage } from "../../../../lib/safe-error";
import { emit } from "../../../../lib/webhooks";
import { linkTenantToLead } from "../../../../lib/lead-link";

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

  // The pre-flight that used to live here — SELECT id FROM tenants WHERE
  // org_id = $1 AND room_number = $2 — was removed (104 / A2). It compared
  // room_number as free text across the whole org, so Property A's "Room 1"
  // falsely collided with Property B's "Room 1" and intake refused with a
  // "Room 1 is already occupied" the user could never satisfy except by
  // switching property. The real uniqueness lives on the UNIT, enforced by
  // migration 051's `uq_tenancies_one_active_per_unit` partial unique index.
  // The tenancy-link block below hits that index naturally; a 23505 there is
  // translated into a user-friendly 409 at the write site.

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

    // Started from a room ("Add tenancy → Full intake"): link the new tenant
    // to that room now, so the property page shows them housed without a
    // second step. Rent is set afterwards on the property page — it isn't an
    // intake-form field. If a dropdown wasn't used (state.unit_id missing),
    // we resolve the room by (property address, room reference) tuple — one
    // match wins, zero or many leaves the tenant un-linked for a human to
    // place. Migration 051's unique index is the source of truth: a 23505
    // from writeWithAudit means another intake just took that room.
    let linkedUnit: string | null = null;
    let unitIdToLink: string | null = state.unit_id ?? null;

    if (!unitIdToLink && parsed.data.room_number && parsed.data.address) {
      const resolved = await db().query<{ id: string }>(
        `SELECT u.id FROM units u
           JOIN properties p ON p.id = u.property_id
          WHERE u.org_id = $1 AND u.reference = $2
            AND lower(trim(p.address_line1)) = lower(trim($3))
          LIMIT 2`,
        [auth.actor.org_id, parsed.data.room_number, parsed.data.address]);
      // Exactly one match → use it. 0 or >1 → leave for a human to resolve.
      if (resolved.rows.length === 1) unitIdToLink = resolved.rows[0]!.id;
    }

    if (unitIdToLink) {
      try {
        await writeWithAudit({
          table: "tenancies",
          record: { unit_id: unitIdToLink, tenant_id: tenant.id, org_id: auth.actor.org_id, status: "active", rent_amount: 0, rent_frequency: "weekly" } as Record<string, unknown>,
          action: "CREATE", org_id: auth.actor.org_id, tenant_id: tenant.id as string, ...auth.actor,
        });
        linkedUnit = unitIdToLink;
      } catch (e) {
        // Postgres 23505 = unique_violation. In our case the only unique
        // index on an active tenancy is uq_tenancies_one_active_per_unit —
        // another tenancy for this exact unit beat us to it (race condition
        // between two intakes). Everything else is logged, swallowed, and
        // the tenant row stands un-linked so staff can place them manually.
        const code = (e as { code?: string }).code;
        if (code === "23505") {
          // Resolve property name for a useful message.
          const r = await db().query<{ property_name: string | null; address: string | null; reference: string }>(
            `SELECT p.name AS property_name, p.address_line1 AS address, u.reference
               FROM units u JOIN properties p ON p.id = u.property_id
              WHERE u.id = $1`, [unitIdToLink]).catch(() => ({ rows: [] as Array<{ property_name: string | null; address: string | null; reference: string }> }));
          const row = r.rows[0];
          const where = row ? ` at ${row.property_name ?? row.address ?? "that property"}` : "";
          const name = row?.reference ?? parsed.data.room_number ?? "That room";
          return NextResponse.json(
            {
              error: `${name}${where} was just taken by another intake. The tenant was created but not placed — pick a different room on the property page.`,
              code: "room_occupied",
              tenant_id: tenant.id,
            },
            { status: 409 },
          );
        }
        console.error("[intake/commit] tenancy link failed (tenant still created):", e);
      }
    }

    // Mark the draft completed (best-effort; audited like any draft write).
    await writeWithAudit({
      table: "drafts",
      record: { id: draftId, step: 5 } as Record<string, unknown>,
      action: "UPDATE",
      ...auth.actor,
    });

    // The lead closes — the one the draft carried, or the open lead this plainly is (same phone / email / name).
    {
      const t = tenant as Record<string, unknown>;
      await linkTenantToLead({ orgId: auth.actor.org_id, tenantId: String(t["id"]), leadId: state.lead_id ?? null, fullName: String(t["full_name"] ?? ""), phone: (t["mobile"] as string | null) ?? null, email: (t["email"] as string | null) ?? null, referralSource: (t["referral_source"] as string | null) ?? null, actor: auth.actor });
    }
    emit(auth.actor.org_id, "tenant.created", { ...(tenant as Record<string, unknown>), linked_unit: linkedUnit });
    return NextResponse.json({ tenant, linked_unit: linkedUnit }, { status: 201 });
  } catch (err) {
    const message = toSafeErrorMessage(err, "Commit failed");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
