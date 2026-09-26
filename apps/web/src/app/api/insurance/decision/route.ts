import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { can } from "@tenant-hub/auth";
import { InsuranceDecisionSchema } from "@tenant-hub/validation";
import { getApiAuth } from "../../../../lib/api-auth";

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

  if (!can(auth.actor.user_role, "insurance", "update")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = InsuranceDecisionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid decision", issues: parsed.error.issues }, { status: 422 });
  const { cycle_id, decision, chosen_quote_id } = parsed.data;

  const { data: existing, error: readErr } = await auth.supabase
    .from("insurance_renewal_cycles")
    .select("id, status, best_quote_id")
    .eq("id", cycle_id)
    .single();
  if (readErr || !existing) return NextResponse.json({ error: readErr?.message ?? "Not found" }, { status: 404 });
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
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
