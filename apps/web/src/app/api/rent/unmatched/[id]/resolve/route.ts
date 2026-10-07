import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../../../lib/safe-error";

interface UnmatchedRow {
  id: string;
  org_id: string;
  tenant_id: string | null;
  amount: string | number;
  received_on: string;
  external_reference: string | null;
  status: string;
}

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
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  if (!can(auth.actor.user_role, "rent", "update")) return NextResponse.json({ error: "Permission denied" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (action !== "confirm" && action !== "dismiss") return NextResponse.json({ error: "action must be 'confirm' or 'dismiss'" }, { status: 422 });

  const existingR = await db().query<UnmatchedRow>(
    "SELECT id, org_id, tenant_id, amount, received_on, external_reference, status FROM rent_unmatched WHERE id = $1 AND org_id = $2",
    [params.id, auth.actor.org_id],
  );
  const existing = existingR.rows[0];
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "pending") return NextResponse.json({ error: "Already resolved" }, { status: 409 });

  try {
    const now = new Date().toISOString();

    if (action === "confirm") {
      if (!existing.tenant_id) return NextResponse.json({ error: "No tenant to confirm this against" }, { status: 422 });
      const tenancyR = await db().query<{ id: string }>(
        "SELECT id FROM tenancies WHERE tenant_id = $1 AND status = 'active' AND org_id = $2 LIMIT 1",
        [existing.tenant_id, auth.actor.org_id],
      );
      const tenancy = tenancyR.rows[0];
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
