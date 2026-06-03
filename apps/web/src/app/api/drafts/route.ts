import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../lib/api-auth";
import type { DraftState } from "../../../lib/intake";

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
  const machine_state: DraftState = { input_mode, extracted: {} };

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
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
