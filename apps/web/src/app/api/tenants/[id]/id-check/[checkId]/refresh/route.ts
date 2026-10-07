import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { idCheck } from "@tenant-hub/adapters";
import { getApiAuth } from "../../../../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * POST — polls the provider for this check's current status and updates the
 * row. In simulated mode this always resolves to "refer" (H9: a simulated
 * check never reports a conclusive pass/fail), so staff see the full flow
 * end to end with zero credentials configured. In live mode, the real
 * credential-bearing webhook (/api/webhooks/credas) is the normal path —
 * this is the manual fallback for "has it come back yet".
 */
export async function POST(_req: Request, { params }: { params: { id: string; checkId: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  try {
    const existing = await db().query<{ id: string; provider_ref: string }>(
      "SELECT id, provider_ref FROM tenant_id_checks WHERE id = $1 AND tenant_id = $2 AND org_id = $3",
      [params.checkId, params.id, auth.actor.org_id],
    );
    const row = existing.rows[0];
    if (!row) return NextResponse.json({ error: "Check not found" }, { status: 404 });

    const result = await idCheck().getCheckStatus(row.provider_ref);

    const { data } = await writeWithAudit({
      table: "tenant_id_checks",
      record: { id: row.id, status: result.data.outcome, detail: result.data.detail ?? null } as Record<string, unknown>,
      action: "UPDATE",
      org_id: auth.actor.org_id,
      tenant_id: params.id,
      user_id: auth.actor.user_id,
      user_name: auth.actor.user_name,
      user_role: auth.actor.user_role,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[tenants/[id]/id-check/[checkId]/refresh:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
