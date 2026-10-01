import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../../../lib/safe-error";

/**
 * POST /api/rent/unmatched/[id]/resolve — "Is this rent?" answered. A weak
 * bank-feed match (rent-reconciliation.ts, confidence below its own
 * threshold) waits here until a person says yes or no; the agent's mandate
 * never lets it mark a weak match paid on its own. "confirm" records the
 * payment against the agent's best-guess tenant, through writeWithAudit,
 * with the signed-in person as the real actor. "dismiss" records that it
 * was looked at and isn't rent.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!can(auth.actor.user_role, "rent", "update")) return NextResponse.json({ error: "Permission denied" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (action !== "confirm" && action !== "dismiss") return NextResponse.json({ error: "action must be 'confirm' or 'dismiss'" }, { status: 422 });

  const { data: existing, error: readErr } = await auth.supabase
    .from("rent_unmatched")
    .select("id, org_id, tenant_id, amount, received_on, external_reference, status")
    .eq("id", params.id)
    .single();
  if (readErr || !existing) return NextResponse.json({ error: toSafeErrorMessage(readErr, "Not found") }, { status: 404 });
  if (existing.status !== "pending") return NextResponse.json({ error: "Already resolved" }, { status: 409 });

  try {
    const now = new Date().toISOString();

    if (action === "confirm") {
      if (!existing.tenant_id) return NextResponse.json({ error: "No tenant to confirm this against" }, { status: 422 });
      const { data: tenancy } = await auth.supabase.from("tenancies").select("id").eq("tenant_id", existing.tenant_id).eq("status", "active").maybeSingle();
      await writeWithAudit({
        table: "rent_payments",
        record: {
          tenant_id: existing.tenant_id, tenancy_id: tenancy?.id ?? null, amount: existing.amount, payment_type: "Bank transfer",
          payment_date: existing.received_on, reference_note: existing.external_reference, external_reference: existing.external_reference,
        } as Record<string, unknown>,
        action: "CREATE", org_id: existing.org_id, tenant_id: existing.tenant_id, ...auth.actor,
      });
    }

    const { data } = await writeWithAudit({
      table: "rent_unmatched",
      record: { id: params.id, status: action === "confirm" ? "confirmed" : "dismissed", resolved_by: auth.actor.user_id, resolved_at: now } as Record<string, unknown>,
      action: "UPDATE", org_id: existing.org_id, tenant_id: existing.tenant_id ?? undefined, ...auth.actor,
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err, "Unknown error") }, { status: 500 });
  }
}
