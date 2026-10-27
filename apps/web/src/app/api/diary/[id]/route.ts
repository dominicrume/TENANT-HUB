import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../lib/safe-error";
import { landlordScope } from "../../../../lib/landlord-scope";

export const dynamic = "force-dynamic";

/** PATCH { done } — tick a diary entry off (or back on). DELETE — remove one. Hand-made entries only; the rest are ticked where they live. */
export const PATCH = withRouteHandler({ resource: "tenants", action: "update" }, async (req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { done?: boolean; notes?: string; starts_at?: string; ends_at?: string | null; status?: string; assigned_to?: string | null; title?: string; kind?: string; recurrence?: string; recur_until?: string | null; accompanied_by?: string | null; feedback?: string; feedback_notes?: string } | null;
  // An occurrence of a repeating event is addressed as `${seriesId}@${day}` — changes apply to the series.
  const id = params.id.split("@")[0]!;
  try {
    // Landlord-scope: a diary entry is only reachable while scoped to its
    // property's landlord. 404 when it isn't — same as GET.
    const scope = landlordScope(auth, "viaProperty", { col: "property_id", paramIndex: 3 });
    const owned = await db().query(`SELECT 1 FROM diary_entries WHERE id = $1 AND org_id = $2${scope.sql}`, [id, auth.actor.org_id, ...scope.params]);
    if (!owned.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const record: Record<string, unknown> = { id };
    if (typeof body?.recurrence === "string" && ["none", "daily", "weekdays", "weekly", "fortnightly", "monthly"].includes(body.recurrence)) record["recurrence"] = body.recurrence;
    if (body && "recur_until" in body) record["recur_until"] = body.recur_until && !Number.isNaN(Date.parse(body.recur_until)) ? body.recur_until.slice(0, 10) : null;
    if (body && "accompanied_by" in body) record["accompanied_by"] = body.accompanied_by && ["agent", "landlord", "both"].includes(body.accompanied_by) ? body.accompanied_by : null;
    if (typeof body?.feedback === "string" && ["none", "not_received", "received", "shared", "skipped"].includes(body.feedback)) record["feedback"] = body.feedback;
    if (typeof body?.feedback_notes === "string") record["feedback_notes"] = body.feedback_notes.trim() || null;
    if (typeof body?.done === "boolean") record["done_at"] = body.done ? new Date().toISOString() : null;
    if (typeof body?.notes === "string") record["notes"] = body.notes.trim() || null;
    if (typeof body?.title === "string" && body.title.trim()) record["title"] = body.title.trim();
    if (typeof body?.kind === "string") record["kind"] = body.kind;
    if (typeof body?.starts_at === "string" && !Number.isNaN(Date.parse(body.starts_at))) record["starts_at"] = body.starts_at;
    if (body && "ends_at" in body) record["ends_at"] = body.ends_at && !Number.isNaN(Date.parse(body.ends_at)) ? body.ends_at : null;
    if (body && "assigned_to" in body) record["assigned_to"] = body.assigned_to?.trim() || null;
    if (typeof body?.status === "string" && ["confirmed", "unconfirmed", "cancelled"].includes(body.status)) record["status"] = body.status;
    const { data } = await writeWithAudit({ table: "diary_entries", record, action: "UPDATE", org_id: auth.actor.org_id, ...auth.actor });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});

export const DELETE = withRouteHandler({ resource: "tenants", action: "delete" }, async (_req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const id = params.id.split("@")[0];
  const scope = landlordScope(auth, "viaProperty", { col: "property_id", paramIndex: 3 });
  await db().query(`DELETE FROM diary_entries WHERE id = $1 AND org_id = $2${scope.sql}`, [id, auth.actor.org_id, ...scope.params]);
  return NextResponse.json({ ok: true });
});
