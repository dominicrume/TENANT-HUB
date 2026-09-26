/**
 * chain-stamp — drains the stamp_queue outbox onto Polygon (H6: never on the
 * request path). The former standalone stamp worker, now one registered agent:
 * mandated, receipted, and visible on "What the system did". Runs every poll,
 * across organisations, because stamp_queue is global.
 */
import { stampAuditHash } from "@tenant-hub/blockchain";
import { env } from "@tenant-hub/env";
import { logger, span, type TelemetrySink } from "@tenant-hub/telemetry";
import type { DbClient } from "@tenant-hub/db";
import { mandate, read, receipt } from "./common";

export const STAMP_MANDATE = mandate("chain-stamp", ["stamp_queue"], ["move_money", "send_legal_notice", "bind_insurance"]);
export const STAMP_LABEL = "Blockchain stamp";
const MAX_RETRY = 3;
const backoffMs = (attempt: number) => Math.pow(2, attempt) * 60_000; // 2m, 4m, 8m

interface Stamp { id: string; audit_hash: string; retry_count: number | null }

export interface StampDeps { client: DbClient; sink: TelemetrySink; stamp?: (hash: string) => Promise<string>; limit?: number }

/** One pass: claim due pending stamps, anchor each, record done / retry / dead-letter. */
export async function drainStamps(d: StampDeps): Promise<{ done: number; failed: number }> {
  const stamp = d.stamp ?? ((h: string) => stampAuditHash(h, env.server.POLYGON_RPC_URL ?? "", env.server.STAMP_WALLET_PRIVATE_KEY ?? ""));
  const r = receipt("chain-stamp", "anchor", "recorded");
  read(r, STAMP_MANDATE, "stamp_queue", "live");
  const pending = (await d.client.query<Stamp>(
    `UPDATE stamp_queue SET status = 'processing', updated_at = NOW()
     WHERE id IN (SELECT id FROM stamp_queue WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= NOW())
                  ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED)
     RETURNING id, audit_hash, retry_count`, [d.limit ?? 10])).rows;
  if (pending.length === 0) return { done: 0, failed: 0 };

  let done = 0, failed = 0;
  await span(d.sink, "chain-stamp", null, crypto.randomUUID(), async () => {
    for (const s of pending) {
      try {
        const tx = await stamp(s.audit_hash);
        await d.client.query("UPDATE stamp_queue SET status = 'done', tx_hash = $2, error = NULL, updated_at = NOW() WHERE id = $1", [s.id, tx]);
        done++;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const attempt = (s.retry_count ?? 0) + 1;
        failed++;
        if (attempt >= MAX_RETRY) {
          await d.client.query("UPDATE stamp_queue SET status = 'dead_letter', error = $2, retry_count = $3, next_retry_at = NULL, updated_at = NOW() WHERE id = $1", [s.id, message, attempt]);
          logger.error("stamp.dead_letter", { stampId: s.id, error: message });
        } else {
          await d.client.query("UPDATE stamp_queue SET status = 'pending', error = $2, retry_count = $3, next_retry_at = $4, updated_at = NOW() WHERE id = $1",
            [s.id, message, attempt, new Date(Date.now() + backoffMs(attempt))]);
        }
      }
    }
    await d.sink.emit({ agent: "chain-stamp", event: "end", correlationId: "batch", fields: { done, failed } });
  });
  return { done, failed };
}
