import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../../lib/safe-error";
import { journeysForOrg } from "../../../../../lib/journey-server";
import { REFERRAL_SOURCES } from "../../../../../lib/signup";
import { isTenantInScope } from "../../../../../lib/landlord-scope";

export const dynamic = "force-dynamic";

const TICKABLE = new Set(["viewing", "moved_in", "moved_out", "onboarded", "lead_received"]);

/** GET — this tenant's eight stations, coloured. */
export const GET = withRouteHandler({ resource: "tenants", action: "read" }, async (_req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  try {
    // Landlord-scope: a wrong-landlord URL poke returns the same 404 as a non-existent tenant.
    const inScope = await isTenantInScope((sql, p) => db().query(sql, p), auth, params.id);
    if (!inScope) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    const [j] = await journeysForOrg(auth.actor.org_id, params.id);
    if (!j) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    return NextResponse.json(j, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});

/**
 * POST { station, done?, assignedTo?, note?, doneAt? } — a person's tick on
 * a station that IS a person's act (viewing done, moved out, portal
 * onboarding when there's no screenshot). Evidence stations (claim done,
 * email sent, signed up) can't be ticked here: upload the document and
 * they turn green on their own.
 */
export const POST = withRouteHandler({ resource: "tenants", action: "update" }, async (req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { station?: string; done?: boolean; assignedTo?: string | null; note?: string | null; doneAt?: string | null; referralSource?: string; at?: string | null } | null;
  const station = body?.station ?? "";
  if (!TICKABLE.has(station)) return NextResponse.json({ error: "That station turns green when its evidence is uploaded — add the document instead." }, { status: 422 });
  try {
    const owned = (await db().query<{ full_name: string }>("SELECT full_name FROM tenants WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id])).rows[0];
    if (!owned) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    // Landlord-scope write guard: refuse to tick a station on a tenant outside the active landlord's portfolio.
    const inScope = await isTenantInScope((sql, p) => db().query(sql, p), auth, params.id);
    if (!inScope) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    // Station 1: how they came to us — one of three — lives on the tenant record itself.
    if (station === "lead_received") {
      const src = body?.referralSource;
      if (!REFERRAL_SOURCES.some((s) => s.key === src)) return NextResponse.json({ error: "Pick one of the three: self-referred, professionally referred, via advert" }, { status: 422 });
      await writeWithAudit({ table: "tenants", record: { id: params.id, referral_source: src } as Record<string, unknown>, action: "UPDATE", org_id: auth.actor.org_id, tenant_id: params.id, ...auth.actor });
      const [j] = await journeysForOrg(auth.actor.org_id, params.id);
      return NextResponse.json(j);
    }

    // Station 2: assigning a viewing with a time puts it in that person's diary.
    if (station === "viewing" && body?.assignedTo && body?.at && !Number.isNaN(Date.parse(body.at))) {
      await db().query("DELETE FROM diary_entries WHERE tenant_id = $1 AND kind = 'viewing' AND done_at IS NULL", [params.id]);
      await writeWithAudit({
        table: "diary_entries",
        record: { org_id: auth.actor.org_id, kind: "viewing", title: `Viewing · ${owned.full_name}`, starts_at: new Date(body.at).toISOString(), tenant_id: params.id, assigned_to: body.assignedTo.trim(), notes: body.note?.trim() || null, created_by: auth.actor.user_name } as Record<string, unknown>,
        action: "CREATE", org_id: auth.actor.org_id, tenant_id: params.id, ...auth.actor,
      });
    }
    const existing = (await db().query<{ id: string }>("SELECT id FROM tenant_stations WHERE tenant_id = $1 AND station = $2", [params.id, station])).rows[0];
    const record: Record<string, unknown> = { ...(existing ? { id: existing.id } : { org_id: auth.actor.org_id, tenant_id: params.id, station }) };
    if (typeof body?.done === "boolean") { record["done_at"] = body.done ? (body.doneAt && !Number.isNaN(Date.parse(body.doneAt)) ? new Date(body.doneAt).toISOString() : new Date().toISOString()) : null; record["done_by"] = body.done ? auth.actor.user_name : null; }
    if (body && "assignedTo" in body) record["assigned_to"] = body.assignedTo?.trim() || null;
    if (body && "note" in body) record["note"] = body.note?.trim() || null;
    await writeWithAudit({ table: "tenant_stations", record, action: existing ? "UPDATE" : "CREATE", org_id: auth.actor.org_id, tenant_id: params.id, ...auth.actor });
    // Viewing done → the diary entry is ticked too.
    if (station === "viewing" && typeof body?.done === "boolean") {
      await db().query("UPDATE diary_entries SET done_at = CASE WHEN $2 THEN COALESCE(done_at, NOW()) ELSE NULL END WHERE tenant_id = $1 AND kind = 'viewing'", [params.id, body.done]);
    }
    // Station 4: confirming the move-in puts the date on the record (Matloob: "moved in should give us the option to confirm it").
    if (station === "moved_in" && typeof body?.done === "boolean") {
      await writeWithAudit({ table: "tenants", record: { id: params.id, moved_in: body.done ? (record["done_at"] as string).slice(0, 10) : null } as Record<string, unknown>, action: "UPDATE", org_id: auth.actor.org_id, tenant_id: params.id, ...auth.actor });
    }
    // Moving out closes the active tenancy's room too — the room becomes free on the board.
    if (station === "moved_out" && body?.done) {
      const endDate = (record["done_at"] as string).slice(0, 10);
      const ty = (await db().query<{ id: string }>("SELECT id FROM tenancies WHERE tenant_id = $1 AND status = 'active'", [params.id])).rows;
      for (const row of ty) await writeWithAudit({ table: "tenancies", record: { id: row.id, status: "ended", end_date: endDate } as Record<string, unknown>, action: "UPDATE", org_id: auth.actor.org_id, tenant_id: params.id, ...auth.actor }).catch(() => {});
    }
    const [j] = await journeysForOrg(auth.actor.org_id, params.id);
    return NextResponse.json(j);
  } catch (err) {
    console.error("[journey:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
