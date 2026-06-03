/**
 * Transactional Outbox — H6: stamp NEVER on the HTTP request path.
 *
 * Flow:
 *  1. writeWithAudit() enqueues a row in stamp_queue IN THE SAME TRANSACTION
 *  2. apps/worker polls stamp_queue and calls stampRecord()
 *  3. On success: update stamp_queue row status = 'done', store tx_hash
 *  4. On failure: increment retry_count; after 3 retries → 'dead_letter'
 *  5. UI queries stamp_queue for status: pending | done | failed
 */

export type StampStatus = "pending" | "processing" | "done" | "failed" | "dead_letter";

export interface OutboxEntry {
  id:          string;
  tenant_id:   string;
  audit_hash:  string;
  status:      StampStatus;
  retry_count: number;
  tx_hash:     string | null;    // Polygon tx hash when done
  error:       string | null;
  created_at:  string;
  updated_at:  string;
}

/**
 * Stamp a single audit hash onto Polygon (or mock in development).
 * Called exclusively by apps/worker — NEVER in an HTTP route handler.
 */
export async function stampAuditHash(
  auditHash: string,
  rpcUrl: string,
  privateKey: string
): Promise<string> {
  // Phase 1: return mock tx hash in development
  if (!rpcUrl || !privateKey) {
    return `mock_tx_${auditHash.slice(0, 16)}_${Date.now()}`;
  }

  // Phase 2: real Polygon stamp (ethers.js implementation)
  // TODO: implement with ethers.js when Phase 2 is activated
  throw new Error("Polygon stamping not yet configured. Set POLYGON_RPC_URL and STAMP_WALLET_PRIVATE_KEY.");
}
