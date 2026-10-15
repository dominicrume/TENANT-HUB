import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { withRouteHandler } from "../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../lib/safe-error";
import { LEAD_STAGES, LEAD_SOURCES } from "../../../lib/leads";
import { emit } from "../../../lib/webhooks";
import { reconcileLeads } from "../../../lib/lead-link";

export const dynamic = "force-dynamic";

/**
 * Leads (migration 060) — people who might become tenants, on a timeline:
 * received → referenced → viewing → offer → moved in (or lost).
 * GET ?stage=… lists; POST creates. Grouped under the `tenants` resource.
 */
export const GET = withRouteHandler({ resource: "tenants", action: "read" }, async (req, _ctx, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ leads: [], counts: {} });
  const stage = new URL(req.url).searchParams.get("stage");
  try {
    // Anyone on the board who is already a tenant is closed off first — the board never contradicts Tenants.
    await reconcileLeads(auth.actor.org_id, auth.actor);
    const params: unknown[] = [auth.actor.org_id];
    let where = "l.org_id = $1";
    if (stage && stage !== "all") { params.push(stage); where += ` AND l.stage = $${params.length}`; }
    const r = await db().query(
      `SELECT l.*, p.name AS property_name, u.reference AS unit_reference,
              (SELECT d.id FROM drafts d WHERE d.machine_state->>'lead_id' = l.id::text AND d.step < 5 ORDER BY d.created_at DESC LIMIT 1) AS draft_id,
              t.room_number AS tenant_room
       FROM leads l LEFT JOIN properties p ON p.id = l.property_id LEFT JOIN units u ON u.id = l.unit_id LEFT JOIN tenants t ON t.id = l.tenant_id
       WHERE ${where} ORDER BY CASE l.stage WHEN 'lost' THEN 1 ELSE 0 END, l.updated_at DESC`, params);
    const c = await db().query<{ stage: string; n: string }>("SELECT stage, count(*) AS n FROM leads WHERE org_id = $1 GROUP BY stage", [auth.actor.org_id]);
    const counts: Record<string, number> = {};
    for (const s of LEAD_STAGES) counts[s.key] = 0;
    counts["lost"] = 0;
    for (const row of c.rows) counts[row.stage] = Number(row.n);
    return NextResponse.json({ leads: r.rows, counts }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});

export const POST = withRouteHandler({ resource: "tenants", action: "create" }, async (req, _ctx, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { full_name?: string; phone?: string; email?: string; source?: string; notes?: string; property_id?: string | null; landlord_id?: string | null } | null;
  const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
  if (!fullName) return NextResponse.json({ error: "Name: who is this?" }, { status: 422 });
  const source = LEAD_SOURCES.some((s) => s.key === body?.source) ? body!.source : "professionally_referred";
  try {
    const { data } = await writeWithAudit({
      table: "leads",
      record: {
        org_id: auth.actor.org_id, full_name: fullName, phone: body?.phone?.trim() || null, email: body?.email?.trim().toLowerCase() || null,
        source, notes: body?.notes?.trim() || null, property_id: body?.property_id || null, landlord_id: body?.landlord_id || null,
        stage: "received", created_by: auth.actor.user_name,
      } as Record<string, unknown>,
      action: "CREATE", org_id: auth.actor.org_id, ...auth.actor,
    });
    emit(auth.actor.org_id, "tenant.created", { lead: data });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[leads:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
