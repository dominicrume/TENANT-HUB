import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/** PATCH { done } — tick a diary entry off (or back on). DELETE — remove one. Hand-made entries only; the rest are ticked where they live. */
export const PATCH = withRouteHandler({ resource: "tenants", action: "update" }, async (req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { done?: boolean; notes?: string; starts_at?: string } | null;
  try {
    const owned = await db().query("SELECT 1 FROM diary_entries WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id]);
    if (!owned.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const record: Record<string, unknown> = { id: params.id };
    if (typeof body?.done === "boolean") record["done_at"] = body.done ? new Date().toISOString() : null;
    if (typeof body?.notes === "string") record["notes"] = body.notes.trim() || null;
    if (typeof body?.starts_at === "string" && !Number.isNaN(Date.parse(body.starts_at))) record["starts_at"] = body.starts_at;
    const { data } = await writeWithAudit({ table: "diary_entries", record, action: "UPDATE", org_id: auth.actor.org_id, ...auth.actor });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});

export const DELETE = withRouteHandler({ resource: "tenants", action: "delete" }, async (_req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  await db().query("DELETE FROM diary_entries WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id]);
  return NextResponse.json({ ok: true });
});
