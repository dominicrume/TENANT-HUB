/**
 * Outbound webhooks — the integrations mechanism (migration 052). An org
 * registers a URL under Settings → Integrations; when something happens we
 * POST a signed JSON event to it. Zapier, Make, n8n, Power Automate and any
 * custom script all speak this; it is how "years of integrations" is bought
 * without building a connector per vendor.
 *
 * Contract (documented here, shown on the Integrations tab):
 *   POST <url>
 *   Content-Type: application/json
 *   X-TenantHub-Event: tenancy.created
 *   X-TenantHub-Delivery: <uuid>
 *   X-TenantHub-Timestamp: <unix seconds>
 *   X-TenantHub-Signature: sha256=<hex HMAC of "<timestamp>.<body>" with the hook secret>
 *   body: { "event", "orgId", "occurredAt", "data" }
 *
 * `emit` never throws and never blocks the request path (H6 thinking: an
 * integration that's down must not stop a tenancy being saved). Every
 * attempt is recorded so a silently-dead hook is visible, not mysterious.
 */
import { createHmac, randomUUID } from "node:crypto";
import { db, webhooksForEvent, recordDelivery } from "@tenant-hub/db";

export const WEBHOOK_EVENTS = [
  "tenant.created",
  "tenancy.created",
  "ticket.created",
  "document.filed",
  "document.received",
  "payment.recorded",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function sign(secret: string, timestamp: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function emit(orgId: string | null | undefined, event: WebhookEvent, data: Record<string, unknown>): void {
  if (!orgId) return;
  void deliver(orgId, event, data).catch((err) => console.warn("[webhooks] emit failed", event, err));
}

async function deliver(orgId: string, event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
  const hooks = await webhooksForEvent(db(), orgId, event);
  if (hooks.length === 0) return;
  const occurredAt = new Date().toISOString();
  const body = JSON.stringify({ event, orgId, occurredAt, data });
  const timestamp = String(Math.floor(Date.now() / 1000));

  await Promise.all(hooks.map(async (hook) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "TenantHub-Webhooks/1.0",
          "X-TenantHub-Event": event,
          "X-TenantHub-Delivery": randomUUID(),
          "X-TenantHub-Timestamp": timestamp,
          "X-TenantHub-Signature": sign(hook.secret, timestamp, body),
        },
        body,
        signal: controller.signal,
      });
      await recordDelivery(db(), { webhookId: hook.id, event, statusCode: res.status, ok: res.ok, error: res.ok ? null : `HTTP ${res.status}` });
    } catch (err) {
      const message = err instanceof Error ? (err.name === "AbortError" ? "Timed out after 5s" : err.message) : "Unknown error";
      await recordDelivery(db(), { webhookId: hook.id, event, statusCode: null, ok: false, error: message.slice(0, 300) }).catch(() => {});
    } finally {
      clearTimeout(timer);
    }
  }));
}
