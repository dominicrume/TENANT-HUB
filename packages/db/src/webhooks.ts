/**
 * Outbound webhooks (migration 052): per-org URLs that get a signed POST
 * when something happens. The dispatcher lives in apps/web (it needs
 * fetch + the public origin); this is only the storage. Every attempt is
 * recorded — an integration that quietly stopped is the H9 failure mode.
 */
import type { Queryable } from "./pool";

export interface WebhookRow { id: string; orgId: string; url: string; secret: string; events: string[]; active: boolean; label: string | null; createdAt: string }

const map = (r: { id: string; org_id: string; url: string; secret: string; events: string[]; active: boolean; label: string | null; created_at: string }): WebhookRow =>
  ({ id: r.id, orgId: r.org_id, url: r.url, secret: r.secret, events: r.events ?? [], active: r.active, label: r.label, createdAt: r.created_at });

export async function listWebhooks(client: Queryable, orgId: string): Promise<WebhookRow[]> {
  const r = await client.query<Parameters<typeof map>[0]>("SELECT * FROM org_webhooks WHERE org_id = $1 ORDER BY created_at DESC", [orgId]);
  return r.rows.map(map);
}

/** Active hooks that want this event (empty events = all). */
export async function webhooksForEvent(client: Queryable, orgId: string, event: string): Promise<WebhookRow[]> {
  const r = await client.query<Parameters<typeof map>[0]>(
    "SELECT * FROM org_webhooks WHERE org_id = $1 AND active AND (cardinality(events) = 0 OR $2 = ANY(events))", [orgId, event]);
  return r.rows.map(map);
}

export async function insertWebhook(client: Queryable, i: { orgId: string; url: string; secret: string; events: string[]; label?: string | null; createdBy: string }): Promise<string> {
  const r = await client.query<{ id: string }>(
    "INSERT INTO org_webhooks (org_id, url, secret, events, label, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [i.orgId, i.url, i.secret, i.events, i.label ?? null, i.createdBy]);
  return r.rows[0]!.id;
}

export async function deleteWebhook(client: Queryable, i: { id: string; orgId: string }): Promise<void> {
  await client.query("DELETE FROM org_webhooks WHERE id = $1 AND org_id = $2", [i.id, i.orgId]);
}

export async function recordDelivery(client: Queryable, i: { webhookId: string; event: string; statusCode: number | null; ok: boolean; error?: string | null }): Promise<void> {
  await client.query("INSERT INTO webhook_deliveries (webhook_id, event, status_code, ok, error) VALUES ($1, $2, $3, $4, $5)",
    [i.webhookId, i.event, i.statusCode, i.ok, i.error ?? null]);
}

export interface DeliveryRow { id: string; webhookId: string; event: string; statusCode: number | null; ok: boolean; error: string | null; attemptedAt: string }

export async function recentDeliveries(client: Queryable, orgId: string, limit = 30): Promise<DeliveryRow[]> {
  const r = await client.query<{ id: string; webhook_id: string; event: string; status_code: number | null; ok: boolean; error: string | null; attempted_at: string }>(
    `SELECT d.id, d.webhook_id, d.event, d.status_code, d.ok, d.error, d.attempted_at FROM webhook_deliveries d
     JOIN org_webhooks w ON w.id = d.webhook_id WHERE w.org_id = $1 ORDER BY d.attempted_at DESC LIMIT $2`, [orgId, limit]);
  return r.rows.map((d) => ({ id: d.id, webhookId: d.webhook_id, event: d.event, statusCode: d.status_code, ok: d.ok, error: d.error, attemptedAt: d.attempted_at }));
}
