import { NextResponse } from "next/server";
import { db, listWebhooks, insertWebhook, recentDeliveries } from "@tenant-hub/db";
import { generateToken } from "@tenant-hub/auth";
import { withRouteHandler } from "../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../lib/safe-error";
import { WEBHOOK_EVENTS } from "../../../lib/webhooks";

export const dynamic = "force-dynamic";

/**
 * Outbound webhooks for this organisation (Settings → Integrations).
 * Managers only — the `audit_logs` resource is the manager-only gate already
 * in the RBAC matrix, and a hook sees every event the audit log does.
 * Inbound provider webhooks live under /api/webhooks/<provider> and are
 * public by signature; this collection route is session-gated.
 */
export const GET = withRouteHandler({ resource: "audit_logs", action: "read" }, async (_req, _ctx, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ hooks: [], deliveries: [], events: WEBHOOK_EVENTS });
  const [hooks, deliveries] = await Promise.all([listWebhooks(db(), auth.actor.org_id), recentDeliveries(db(), auth.actor.org_id, 30)]);
  return NextResponse.json({
    hooks: hooks.map(({ secret, ...h }) => ({ ...h, secretHint: `…${secret.slice(-4)}` })),
    deliveries,
    events: WEBHOOK_EVENTS,
  }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withRouteHandler({ resource: "audit_logs", action: "read" }, async (req, _ctx, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  if (auth.actor.user_role !== "manager" && auth.actor.user_role !== "admin") return NextResponse.json({ error: "Managers only" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { url?: string; events?: string[]; label?: string } | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  let parsedUrl: URL;
  try { parsedUrl = new URL(url); } catch { return NextResponse.json({ error: "Enter a full URL, starting with https://" }, { status: 422 }); }
  if (parsedUrl.protocol !== "https:" && !/^(localhost|127\.0\.0\.1)$/.test(parsedUrl.hostname)) {
    return NextResponse.json({ error: "Webhook URLs must use https://" }, { status: 422 });
  }
  const events = Array.isArray(body?.events) ? body!.events.filter((e): e is (typeof WEBHOOK_EVENTS)[number] => (WEBHOOK_EVENTS as readonly string[]).includes(e)) : [];
  try {
    const secret = `whsec_${generateToken()}`;
    const id = await insertWebhook(db(), { orgId: auth.actor.org_id, url, secret, events, label: body?.label?.trim() || null, createdBy: auth.actor.user_id });
    // The secret is shown exactly once — only its tail is ever returned again.
    return NextResponse.json({ id, url, events, secret }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
