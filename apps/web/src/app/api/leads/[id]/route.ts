import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../lib/safe-error";
import { LEAD_STAGES, REFERENCE_KINDS, REFERENCE_METHODS, REFERENCE_OUTCOMES } from "../../../../lib/leads";
import type { DraftState } from "../../../../lib/intake";
import { landlordScope } from "../../../../lib/landlord-scope";

export const dynamic = "force-dynamic";

const STAGES = new Set<string>([...LEAD_STAGES.map((s) => s.key), "lost"]);

/**
 * PATCH /api/leads/[id] — move along the timeline, book a viewing (which
 * writes the diary entry), note the property/room, mark lost; or
 * { action: "convert" } → starts the real intake with the lead's details
 * pre-filled and returns the draft id. Moving in is recorded by intake
 * commit, which sets stage = moved_in and tenant_id.
 */
export const PATCH = withRouteHandler({ resource: "tenants", action: "update" }, async (req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { action?: string; stage?: string; viewing_at?: string | null; assigned_to?: string | null; property_id?: string | null; unit_id?: string | null; notes?: string; lost_reason?: string; phone?: string; email?: string; full_name?: string; referee_name?: string; referee_contact?: string; reference_notes?: string;
    kind?: string; contact?: string; method?: string; reference_id?: string; outcome?: string; id_checked?: boolean; benefit_checked?: boolean; no_reference_needed?: boolean } | null;
  try {
    // Landlord-scope: a wrong-landlord URL poke must return the same 404 as a non-existent lead.
    const scope = landlordScope(auth, "direct", { col: "landlord_id", paramIndex: 3 });
    const lead = (await db().query<{ id: string; full_name: string; phone: string | null; email: string | null; stage: string; property_id: string | null; unit_id: string | null; viewing_at: string | null }>(
      `SELECT id, full_name, phone, email, stage, property_id, unit_id, viewing_at FROM leads WHERE id = $1 AND org_id = $2${scope.sql}`, [params.id, auth.actor.org_id, ...scope.params])).rows[0];
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    if (body?.action === "convert") {
      // The intake draft carries the lead's details; the lead rides along so commit can close the loop.
      const unit = lead.unit_id ? (await db().query<{ reference: string; address_line1: string | null; name: string; postcode: string | null }>(
        "SELECT u.reference, p.address_line1, p.name, p.postcode FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = $1", [lead.unit_id])).rows[0] : null;
      const extracted: DraftState["extracted"] = { full_name: lead.full_name };
      if (lead.phone) extracted["mobile"] = lead.phone;
      if (lead.email) extracted["email"] = lead.email;
      if (unit) { extracted["room_number"] = unit.reference; extracted["address"] = unit.address_line1 || unit.name; if (unit.postcode) extracted["postcode"] = unit.postcode; }
      const machine_state: DraftState = { input_mode: "manual", extracted, lead_id: lead.id, ...(lead.unit_id ? { unit_id: lead.unit_id } : {}) };
      const { data } = await writeWithAudit({
        table: "drafts", record: { created_by: auth.actor.user_id, machine_state, step: 1 } as Record<string, unknown>,
        action: "CREATE", entry_method: "manual", ...auth.actor,
      });
      if (lead.stage === "received" || lead.stage === "referenced" || lead.stage === "viewing") {
        await writeWithAudit({ table: "leads", record: { id: lead.id, stage: "offer" } as Record<string, unknown>, action: "UPDATE", org_id: auth.actor.org_id, ...auth.actor });
      }
      return NextResponse.json({ draftId: (data as Record<string, unknown>)["id"] });
    }

    const record: Record<string, unknown> = { id: lead.id };
    const now = new Date().toISOString();

    // ── Referencing (migration 065): several references, each asked for and answered on its own; two checks. ──
    if (body?.action === "reference_add") {
      const kind = REFERENCE_KINDS.some((k) => k.key === body.kind) ? body.kind! : "other";
      const method = REFERENCE_METHODS.some((m) => m.key === body.method) ? body.method! : null;
      if (!body.referee_name?.trim()) return NextResponse.json({ error: "Who are you asking?" }, { status: 422 });
      await writeWithAudit({ table: "lead_references", record: { org_id: auth.actor.org_id, lead_id: lead.id, kind, referee_name: body.referee_name.trim(), contact: body.contact?.trim() || null, method, notes: body.notes?.trim() || null, created_by: auth.actor.user_name } as Record<string, unknown>, action: "CREATE", org_id: auth.actor.org_id, ...auth.actor });
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "reference_update") {
      const ref = (await db().query<{ id: string }>("SELECT id FROM lead_references WHERE id = $1 AND lead_id = $2", [body.reference_id ?? "", lead.id])).rows[0];
      if (!ref) return NextResponse.json({ error: "Reference not found" }, { status: 404 });
      const outcome = REFERENCE_OUTCOMES.some((o) => o.key === body.outcome) ? body.outcome! : null;
      const rec: Record<string, unknown> = { id: ref.id };
      if (outcome) { rec["outcome"] = outcome; rec["received_at"] = outcome === "pending" ? null : now; }
      if (typeof body.notes === "string") rec["notes"] = body.notes.trim() || null;
      await writeWithAudit({ table: "lead_references", record: rec, action: "UPDATE", org_id: auth.actor.org_id, ...auth.actor });
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "reference_remove") {
      await db().query("DELETE FROM lead_references WHERE id = $1 AND lead_id = $2", [body.reference_id ?? "", lead.id]);
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "check") {
      if (typeof body.id_checked === "boolean") record["id_checked_at"] = body.id_checked ? now : null;
      if (typeof body.benefit_checked === "boolean") record["benefit_checked_at"] = body.benefit_checked ? now : null;
      if (typeof body.no_reference_needed === "boolean") record["no_reference_needed"] = body.no_reference_needed;
    }
    if (body?.action === "referencing_complete") {
      const full = (await db().query<{ id_checked_at: string | null; no_reference_needed: boolean; ok: string }>(
        "SELECT id_checked_at, no_reference_needed, (SELECT count(*) FROM lead_references r WHERE r.lead_id = leads.id AND r.outcome = 'satisfactory') AS ok FROM leads WHERE id = $1", [lead.id])).rows[0]!;
      if (!full.id_checked_at) return NextResponse.json({ error: "Tick 'ID seen' first — referencing isn't complete without it." }, { status: 422 });
      if (!full.no_reference_needed && Number(full.ok) === 0) return NextResponse.json({ error: "No satisfactory reference yet. Mark one satisfactory, or tick 'No reference needed'." }, { status: 422 });
      record["stage"] = "referenced";
    }
    // The three named steps between the viewing and sign-up.
    if (body?.action === "viewing_done") { if (!lead.viewing_at) return NextResponse.json({ error: "Book the viewing first" }, { status: 422 }); record["viewing_done_at"] = now; }
    if (body?.action === "reference_requested") {
      if (!body.referee_name?.trim()) return NextResponse.json({ error: "Who are you asking for the reference?" }, { status: 422 });
      record["referee_name"] = body.referee_name.trim(); record["referee_contact"] = body.referee_contact?.trim() || null; record["reference_notes"] = body.reference_notes?.trim() || null; record["reference_requested_at"] = now;
    }
    if (body?.action === "reference_received") { record["reference_received_at"] = now; record["stage"] = "referenced"; if (typeof body.reference_notes === "string") record["reference_notes"] = body.reference_notes.trim() || null; }
    if (body?.action === "viewing_cancelled") { record["viewing_at"] = null; record["assigned_to"] = null; record["viewing_done_at"] = null; if (lead.stage === "viewing") record["stage"] = "received"; }
    if (body && "assigned_to" in body) record["assigned_to"] = body.assigned_to?.trim() || null;
    if (typeof body?.stage === "string") {
      if (!STAGES.has(body.stage)) return NextResponse.json({ error: "Unknown stage" }, { status: 422 });
      record["stage"] = body.stage;
      if (body.stage === "lost") record["lost_reason"] = body.lost_reason?.trim() || "Not given";
    }
    if (body && "viewing_at" in body) {
      record["viewing_at"] = body.viewing_at || null;
      if (body.viewing_at) { record["viewing_done_at"] = null; if (!record["stage"] && lead.stage === "received") record["stage"] = "viewing"; }
    }
    if (body && "property_id" in body) record["property_id"] = body.property_id || null;
    if (body && "unit_id" in body) record["unit_id"] = body.unit_id || null;
    if (typeof body?.notes === "string") record["notes"] = body.notes.trim() || null;
    if (typeof body?.phone === "string") record["phone"] = body.phone.trim() || null;
    if (typeof body?.email === "string") record["email"] = body.email.trim().toLowerCase() || null;
    if (typeof body?.full_name === "string" && body.full_name.trim()) record["full_name"] = body.full_name.trim();
    if (Object.keys(record).length === 1) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

    const { data } = await writeWithAudit({ table: "leads", record, action: "UPDATE", org_id: auth.actor.org_id, ...auth.actor });

    // A booked viewing is a diary entry, in the calendar of whoever does it — the diary is where tomorrow lives.
    if (body?.viewing_at && (body.viewing_at !== lead.viewing_at || "assigned_to" in body)) {
      const propId = (record["property_id"] as string | null | undefined) ?? lead.property_id;
      const unitId = (record["unit_id"] as string | null | undefined) ?? lead.unit_id;
      const propName = propId ? (await db().query<{ name: string }>("SELECT name FROM properties WHERE id = $1", [propId])).rows[0]?.name : null;
      const unitRef = unitId ? (await db().query<{ reference: string }>("SELECT reference FROM units WHERE id = $1", [unitId])).rows[0]?.reference : null;
      await db().query("DELETE FROM diary_entries WHERE lead_id = $1 AND kind = 'viewing' AND done_at IS NULL", [lead.id]);
      await writeWithAudit({
        table: "diary_entries",
        record: { org_id: auth.actor.org_id, kind: "viewing", title: `Viewing · ${lead.full_name}${propName ? ` · ${propName}` : ""}${unitRef ? ` · ${unitRef}` : ""}`, starts_at: body.viewing_at, lead_id: lead.id, property_id: propId ?? null, assigned_to: (record["assigned_to"] as string | null | undefined) ?? null, status: "confirmed", notes: body.notes?.trim() || null, created_by: auth.actor.user_name } as Record<string, unknown>,
        action: "CREATE", org_id: auth.actor.org_id, ...auth.actor,
      });
    }
    if (body?.action === "viewing_done") await db().query("UPDATE diary_entries SET done_at = COALESCE(done_at, NOW()) WHERE lead_id = $1 AND kind = 'viewing'", [lead.id]);
    if (body?.action === "viewing_cancelled") await db().query("UPDATE diary_entries SET status = 'cancelled' WHERE lead_id = $1 AND kind = 'viewing' AND done_at IS NULL", [lead.id]);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[leads:PATCH]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});

export const DELETE = withRouteHandler({ resource: "tenants", action: "delete" }, async (_req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  // Landlord-scope: refuse to delete a lead that isn't in the active landlord's portfolio.
  const scope = landlordScope(auth, "direct", { col: "landlord_id", paramIndex: 3 });
  await db().query(`DELETE FROM leads WHERE id = $1 AND org_id = $2${scope.sql}`, [params.id, auth.actor.org_id, ...scope.params]);
  return NextResponse.json({ ok: true });
});
