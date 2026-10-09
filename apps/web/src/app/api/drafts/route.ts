import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../lib/api-auth";
import type { DraftState } from "../../../lib/intake";
import { toSafeErrorMessage } from "../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * POST /api/drafts — create an intake draft (H5: server-side, never browser).
 * Written through writeWithAudit so the drafts table keeps audit coverage (H1).
 */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "drafts", "create")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const input_mode = (body.input_mode as DraftState["input_mode"]) ?? "manual";
  // Started from a room ("Add tenancy → Full intake"): the room's address,
  // postcode and number are known, so they're pre-filled rather than retyped,
  // and unit_id rides along so commit can link the tenancy to that room.
  const prefill = (body.prefill && typeof body.prefill === "object" ? body.prefill : {}) as Record<string, unknown>;
  const extracted: DraftState["extracted"] = {};
  for (const k of ["room_number", "address", "postcode"] as const) {
    if (typeof prefill[k] === "string" && (prefill[k] as string).trim()) extracted[k] = (prefill[k] as string).trim();
  }
  const machine_state: DraftState = { input_mode, extracted, ...(typeof body.unit_id === "string" && body.unit_id ? { unit_id: body.unit_id } : {}) };

  try {
    const { data } = await writeWithAudit({
      table: "drafts",
      record: { created_by: auth.actor.user_id, machine_state, step: 1 } as Record<string, unknown>,
      action: "CREATE",
      entry_method: input_mode,
      ...auth.actor,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[drafts:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
