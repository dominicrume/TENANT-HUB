/**
 * @tenant-hub/audit — pure SHA-256 hash chain.
 * NO infrastructure imports. No Supabase. No Next.js.
 * Works in Node and in the browser.
 *
 * Chain invariant: hash_n = SHA256(prev_hash_n-1 || canonical_payload_n)
 * GENESIS prev_hash = "0000000000000000000000000000000000000000000000000000000000000000"
 */

export const GENESIS_HASH = "0".repeat(64);

export interface AuditEntry {
  table_name:  string;
  record_id:   string;
  action:      "CREATE" | "UPDATE" | "DELETE" | "VERIFY" | "SIGN" | "EXPORT" | "LOGIN";
  payload:     unknown;          // the exact bytes we will hash
  user_id:     string;
  user_name:   string;
  user_role:   string;
  prev_hash:   string;           // hash of the previous entry for THIS record
  entry_method?: string;
}

export interface AuditRecord extends AuditEntry {
  hash:        string;
  created_at:  string;           // ISO timestamp set by caller before hashing
}

/**
 * Compute SHA-256 of the canonical payload string.
 * One serializer — no independent re-serialization in DB and TS.
 */
export async function computeHash(entry: Omit<AuditRecord, "hash">): Promise<string> {
  const canonical = buildCanonicalString(entry);
  const buf = new TextEncoder().encode(canonical);

  // Works in Node 20+ (globalThis.crypto) and browser
  const hashBuf = await globalThis.crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The single canonical serializer.
 * DB trigger must produce the EXACT same string to verify parity.
 */
export function buildCanonicalString(entry: Omit<AuditRecord, "hash">): string {
  return [
    entry.prev_hash,
    entry.table_name,
    entry.record_id,
    entry.action,
    entry.user_id,
    entry.created_at,
    JSON.stringify(entry.payload, Object.keys(entry.payload as object).sort()),
  ].join("|");
}

export async function buildAuditRecord(entry: AuditEntry, timestamp: string): Promise<AuditRecord> {
  const partial: Omit<AuditRecord, "hash"> = { ...entry, created_at: timestamp };
  const hash = await computeHash(partial);
  return { ...partial, hash };
}
