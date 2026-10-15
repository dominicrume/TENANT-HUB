import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../lib/safe-error";
import { LEAD_STAGES } from "../../../../lib/leads";
import type { DraftState } from "../../../../lib/intake";

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
  const body = (await req.json().catch(() => null)) as { action?: string; stage?: string; viewing_at?: string | null; assigned_to?: string | null; property_id?: string | null; unit_id?: string | null; notes?: string; lost_reason?: string; phone?: string; email?: string; full_name?: string; referee_name?: string; referee_contact?: string; reference_notes?: string } | null;
  try {
    const lead = (await db().query<{ id: string; full_name: string; phone: string | null; email: string | null; stage: string; property_id: string | null; unit_id: string | null; viewing_at: string | null }>(
      "SELECT id, full_name, phone, email, stage, property_id, unit_id, viewing_at FROM leads WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id])).rows[0];
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
  await db().query("DELETE FROM leads WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id]);
  return NextResponse.json({ ok: true });
});
