import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db, writeWithAudit } from "@tenant-hub/db";
import { env } from "@tenant-hub/env";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/** No human actor — same pattern as the worker's automated agents (apps/worker/src/agents/owner-digest.ts). */
const WEBHOOK_ACTOR = { user_id: "", user_name: "System · credas-webhook", user_role: "system" } as const;

/** Constant-time HMAC-SHA256 compare — same reasoning as the CRON_SECRET check in apps/web/src/app/api/cron/daily-notifications/route.ts, generalised to a signed body instead of a shared secret alone. */
function signatureValid(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * POST /api/webhooks/credas — Credas's async callback when a right-to-rent
 * check resolves. Payload field names are a best-effort guess (see
 * CredasIdCheck in packages/adapters) — confirm against Credas's real
 * webhook docs and adjust before relying on this in production. Only
 * reachable usefully once ADAPTER_MODE_IDCHECK=live and CREDAS_WEBHOOK_SECRET
 * are both set; with no secret configured this refuses every call rather
 * than accepting an unverified one (H9: live can never quietly mean
 * unauthenticated).
 */
export async function POST(req: Request) {
  const secret = env.server.CREDAS_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const rawBody = await req.text();
  const signature = req.headers.get("x-credas-signature");
  if (!signatureValid(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as { id?: string; reference?: string; status?: string; result?: string; summary?: string };
  const providerRef = String(body.id ?? body.reference ?? "");
  if (!providerRef) return NextResponse.json({ error: "Missing check reference" }, { status: 422 });

  const raw = String(body.status ?? body.result ?? "").toLowerCase();
  const status =
    raw === "pass" || raw === "clear" ? "pass" :
    raw === "fail" || raw === "declined" ? "fail" :
    raw === "pending" || raw === "processing" ? "pending" : "refer";

  try {
    const existing = await db().query<{ id: string; org_id: string; tenant_id: string }>(
      "SELECT id, org_id, tenant_id FROM tenant_id_checks WHERE provider = 'credas' AND provider_ref = $1",
      [providerRef],
    );
    const row = existing.rows[0];
    if (!row) return NextResponse.json({ error: "Unknown check reference" }, { status: 404 });

    await writeWithAudit({
      table: "tenant_id_checks",
      record: { id: row.id, status, detail: body.summary ?? null } as Record<string, unknown>,
      action: "UPDATE",
      org_id: row.org_id,
      tenant_id: row.tenant_id,
      ...WEBHOOK_ACTOR,
    });
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[webhooks/credas:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
