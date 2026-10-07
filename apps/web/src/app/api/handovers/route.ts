import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { getApiAuth } from "../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../lib/safe-error";

/**
 * GET /api/handovers — staff-facing. Scoped to the signed-in staff member's
 * own organisation (org_id); an empty org means an empty list, never every
 * org's shift handovers.
 */
export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json([]);

  const url = new URL(req.url);
  const date = url.searchParams.get("date") || new Date().toISOString().split("T")[0];

  try {
    const r = await db().query(
      "SELECT * FROM shift_handovers WHERE org_id = $1 AND shift_date = $2 ORDER BY created_at ASC",
      [auth.actor.org_id, date]);
    return NextResponse.json(r.rows);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || !body.shift_type || !body.notes) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
  }

  try {
    const { data } = await writeWithAudit({
      table: "shift_handovers",
      record: {
        org_id: auth.actor.org_id,
        shift_date: body.shift_date || new Date().toISOString().split("T")[0],
        shift_type: body.shift_type,
        notes: body.notes,
        staff_name: auth.actor.user_name,
      } as Record<string, unknown>,
      action: "CREATE",
      org_id: auth.actor.org_id,
      user_id: auth.actor.user_id,
      user_name: auth.actor.user_name,
      user_role: auth.actor.user_role,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[handovers:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
