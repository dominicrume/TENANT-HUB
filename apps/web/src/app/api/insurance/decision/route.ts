import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { can } from "@tenant-hub/auth";
import { InsuranceDecisionSchema } from "@tenant-hub/validation";
import { getApiAuth } from "../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

interface RenewalCycleRow {
  id: string;
  status: string;
  best_quote_id: string | null;
}

/**
 * POST /api/insurance/decision — a person presses accept, decline or defer
 * on the decision card insurance-renewal stopped at (H10). This route is
 * the ONLY place a cycle is ever set to "decided" — the agent's mandate
 * never includes bind_insurance, and this route never gathers a quote or
 * touches a policy; it only RECORDS a decision already made, through
 * writeWithAudit, with the signed-in person as the real actor.
 */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  if (!can(auth.actor.user_role, "insurance", "update")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = InsuranceDecisionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid decision", issues: parsed.error.issues }, { status: 422 });
  const { cycle_id, decision, chosen_quote_id } = parsed.data;

  const existingR = await db().query<RenewalCycleRow>(
    "SELECT id, status, best_quote_id FROM insurance_renewal_cycles WHERE id = $1 AND org_id = $2",
    [cycle_id, auth.actor.org_id],
  );
  const existing = existingR.rows[0];
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.status !== "awaiting_decision") {
    return NextResponse.json({ error: existing.status === "decided" ? "Already decided" : "Not yet at the decision card" }, { status: 409 });
  }

  try {
    const now = new Date().toISOString();
    const { data } = await writeWithAudit({
      table: "insurance_renewal_cycles",
      record: {
        id: cycle_id, status: "decided", decision,
        best_quote_id: chosen_quote_id ?? existing.best_quote_id,
        decided_by: auth.actor.user_id, decided_at: now,
      } as Record<string, unknown>,
      action: "UPDATE",
      org_id: auth.actor.org_id,
      ...auth.actor,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[insurance/decision:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
