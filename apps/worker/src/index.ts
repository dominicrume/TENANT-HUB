/**
 * Stamp Worker — H6: drains stamp_queue asynchronously.
 * NEVER runs on the HTTP request path.
 * Polls every 30s. Retries up to 3 times. Dead-letters on failure.
 */
import { env } from "@tenant-hub/env";
import { stampAuditHash } from "@tenant-hub/blockchain";

const POLL_MS   = 30_000;
const MAX_RETRY = 3;

async function drainQueue() {
  console.log("[worker] polling stamp_queue …");
  // Sprint 1: query stamp_queue WHERE status = 'pending' LIMIT 10
  // For each entry: call stampAuditHash, update status
  // On error: increment retry_count; if >= MAX_RETRY → dead_letter
}

console.log("[worker] Stamp worker started. Polling every", POLL_MS / 1000, "s");
setInterval(() => { void drainQueue(); }, POLL_MS);
void drainQueue();
