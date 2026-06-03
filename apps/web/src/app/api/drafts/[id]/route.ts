import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../lib/api-auth";
import type { DraftState } from "../../../../lib/intake";

/** GET /api/drafts/[id] — load a draft (RLS-scoped). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { data, error } = await auth.supabase.from("drafts").select("*").eq("id", params.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

/**
 * PATCH /api/drafts/[id] — advance the draft. Body: { machine_state?, step?,
 * canonical_hash? }. Written via writeWithAudit (H1).
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "drafts", "update")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const record: Record<string, unknown> = { id: params.id };
  if (body.machine_state) record["machine_state"] = body.machine_state as DraftState;
  if (typeof body.step === "number") record["step"] = body.step;
  if (typeof body.canonical_hash === "string") record["canonical_hash"] = body.canonical_hash;

  try {
    const { data } = await writeWithAudit({
      table: "drafts",
      record,
      action: "UPDATE",
      ...auth.actor,
    });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
