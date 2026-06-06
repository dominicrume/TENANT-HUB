/**
 * Stamp Worker — H6: drains stamp_queue asynchronously.
 * NEVER runs on the HTTP request path.
 * Polls every 30s. Retries up to 3 times. Dead-letters on failure.
 */
import { env } from "@tenant-hub/env";
import { stampAuditHash } from "@tenant-hub/blockchain";
import { getPendingStamps, updateStampStatus } from "@tenant-hub/db";

const POLL_MS   = 30_000;
const MAX_RETRY = 3;

async function drainQueue() {
  try {
    const pending = await getPendingStamps(10);
    if (pending.length === 0) return;

    console.log(`[worker] Found ${pending.length} pending stamps. Processing...`);

    for (const job of pending) {
      try {
        await updateStampStatus(job.id, { status: "processing" });
        const txHash = await stampAuditHash(job.audit_hash, "", "");
        await updateStampStatus(job.id, { status: "done", tx_hash: txHash });
        console.log(`[worker] Successfully stamped ${job.id} -> ${txHash}`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[worker] Failed to stamp ${job.id}:`, errorMsg);
        
        const nextRetry = (job.retry_count ?? 0) + 1;
        if (nextRetry >= MAX_RETRY) {
          await updateStampStatus(job.id, { status: "dead_letter", error: errorMsg, retry_count: nextRetry });
        } else {
          // Revert to pending for next poll, increment retry
          await updateStampStatus(job.id, { status: "pending", error: errorMsg, retry_count: nextRetry });
        }
      }
    }
  } catch (err) {
    console.error("[worker] Error checking stamp_queue:", err);
  }
}

console.log("[worker] Stamp worker started. Polling every", POLL_MS / 1000, "s");
setInterval(() => { void drainQueue(); }, POLL_MS);
void drainQueue();
