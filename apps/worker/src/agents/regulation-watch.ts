/**
 * regulation-watch — polls legislation.gov.uk's new-legislation feed, records
 * every item once (`regulation_items`, deduped on org_id+external_id — the
 * feed's own id), classifies its scope by rules (@tenant-hub/domain's
 * classifyRegulationScope — supported | residential | commercial | all |
 * unknown), and maps every non-"unknown" item to the properties it actually
 * affects (`regulation_impacts`). "unknown" is never mapped to a property —
 * it sits for a person to read, exactly as it arrived.
 *
 * The feed needs no credentials (it is a public government feed) and so
 * defaults to live, unlike this worker's other adapters — a poll failure
 * (unreachable, or this environment's sandbox has no network egress) is
 * caught and the run ends quietly; nothing here is urgent enough to fail the
 * whole drain over, and the next run tries again. `regulation_sources` is
 * bookkeeping (a cursor, not a domain record), so it is provisioned and its
 * `last_polled_at` kept directly — the audit chain is for what was found and
 * what it affects, not for the polling schedule itself.
 */
import { writeWithAudit } from "@tenant-hub/db";
import { regulationFeed } from "@tenant-hub/adapters";
import { classifyRegulationScope, propertyMatchesScope } from "@tenant-hub/domain";
import type { AssetClass, UnitClass } from "@tenant-hub/validation";
import type { RegulationFeedPort } from "@tenant-hub/ports";
import type { AgentContext } from "../registry";
import { mandate, read, receipt, withOutcome } from "./common";

export const REGULATION_MANDATE = mandate("regulation-watch", ["regulation_feed", "properties"], ["move_money", "send_legal_notice", "bind_insurance", "auto_dispatch_non_emergency"]);
export const REGULATION_LABEL = "New laws";

const AGENT_ACTOR = { user_id: "", user_name: "System · regulation-watch", user_role: "system" } as const;
const ADAPTER_KEY = "legislation.gov.uk";
const EPOCH = "1970-01-01T00:00:00.000Z";

interface PropertyRow { id: string; asset_class: AssetClass; classes: UnitClass[] }
interface SourceRow { id: string; last_polled_at: string | null }

async function ensureSource(ctx: AgentContext): Promise<SourceRow> {
  const existing = (await ctx.client.query<SourceRow>(
    "SELECT id, last_polled_at::text AS last_polled_at FROM regulation_sources WHERE org_id = $1 AND adapter_key = $2", [ctx.orgId, ADAPTER_KEY])).rows[0];
  if (existing) return existing;
  return (await ctx.client.query<SourceRow>(
    "INSERT INTO regulation_sources (org_id, name, adapter_key) VALUES ($1, 'legislation.gov.uk — new legislation', $2) RETURNING id, last_polled_at::text AS last_polled_at",
    [ctx.orgId, ADAPTER_KEY])).rows[0]!;
}

export async function regulationWatch(ctx: AgentContext, adapter: RegulationFeedPort = regulationFeed()): Promise<void> {
  const r = receipt("regulation-watch", "poll", "recorded");
  read(r, REGULATION_MANDATE, "regulation_feed", adapter.mode === "live" ? "live" : "simulated");

  const source = await ensureSource(ctx);
  let items;
  try {
    const result = await adapter.poll(source.last_polled_at ?? EPOCH);
    items = result.data;
  } catch {
    return; // unreachable this run — bookkeeping is untouched, so the next run still tries with the same cursor
  }

  const properties = (await ctx.client.query<PropertyRow>(
    `SELECT p.id, p.asset_class,
            COALESCE(array_remove(array_agg(DISTINCT u.unit_class::text), NULL), ARRAY[]::text[]) AS classes
     FROM properties p LEFT JOIN units u ON u.property_id = p.id
     WHERE p.org_id = $1
     GROUP BY p.id, p.asset_class`, [ctx.orgId])).rows;

  read(r, REGULATION_MANDATE, "properties", "live");

  for (const item of items) {
    const already = (await ctx.client.query<{ id: string }>(
      "SELECT id FROM regulation_items WHERE org_id = $1 AND external_id = $2", [ctx.orgId, item.externalId])).rows[0];
    if (already) continue;

    const { scope, confidence } = classifyRegulationScope(item.title, item.excerpt);
    const saved = await writeWithAudit({
      client: ctx.client, table: "regulation_items", action: "CREATE", org_id: ctx.orgId,
      receipt: withOutcome(r, "recorded"), correlationId: ctx.correlationId, ...AGENT_ACTOR,
      record: {
        org_id: ctx.orgId, source_id: source.id, external_id: item.externalId, title: item.title,
        published_on: item.publishedOn || null, url: item.url || null, raw_excerpt: item.excerpt || null,
        applies_to: scope, confidence, classified_by_model: "rules:regulation",
      },
    });

    if (scope === "unknown") continue; // never mapped — a person reads it as it arrived
    const itemId = String((saved.data as Record<string, unknown>).id);
    for (const p of properties) {
      if (!propertyMatchesScope(scope, p.asset_class, p.classes)) continue;
      await writeWithAudit({
        client: ctx.client, table: "regulation_impacts", action: "CREATE", org_id: ctx.orgId,
        receipt: withOutcome(r, "recorded"), correlationId: ctx.correlationId, ...AGENT_ACTOR,
        record: { org_id: ctx.orgId, regulation_item_id: itemId, property_id: p.id, status: "new" },
      });
    }
  }

  await ctx.client.query("UPDATE regulation_sources SET last_polled_at = NOW() WHERE id = $1", [source.id]);
}
