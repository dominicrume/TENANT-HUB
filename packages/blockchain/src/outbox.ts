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
import { ethers } from "ethers";

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
  next_retry_at: string | null;
}

/** Timeout wrapper — prevents hung RPC connections from blocking the worker. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise
      .then((val) => { clearTimeout(timer); resolve(val); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

const STAMP_TIMEOUT_MS = 30_000;

/**
 * Stamp a single audit hash onto Polygon (or mock in development).
 * Called exclusively by apps/worker — NEVER in an HTTP route handler.
 *
 * In production, sends a minimal transaction with the audit hash embedded
 * in the transaction data field. The hash is permanently recorded on-chain.
 */
export async function stampAuditHash(
  auditHash: string,
  rpcUrl: string,
  privateKey: string
): Promise<string> {
  // Development mock: return a deterministic mock tx hash
  if (!rpcUrl || !privateKey) {
    return `mock_tx_${auditHash.slice(0, 16)}_${Date.now()}`;
  }

  // Production: real Polygon stamp via ethers.js v6
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  // Encode the audit hash as transaction calldata (0x-prefixed hex)
  const data = auditHash.startsWith("0x") ? auditHash : `0x${auditHash}`;

  const tx = await withTimeout(
    wallet.sendTransaction({
      to: wallet.address, // self-send — cheapest way to anchor data on-chain
      value: 0,
      data,
    }),
    STAMP_TIMEOUT_MS,
    "Polygon RPC sendTransaction",
  );

  // Wait for 1 confirmation to ensure the tx is mined
  const receipt = await withTimeout(
    tx.wait(1),
    STAMP_TIMEOUT_MS,
    "Transaction confirmation",
  );

  if (!receipt) {
    throw new Error("Transaction receipt is null — tx may have been dropped");
  }

  return receipt.hash;
}
