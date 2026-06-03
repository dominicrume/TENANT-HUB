/**
 * Canonical SHA-256 of a flat record. The SAME function is used at Step 3
 * (compute) and Step 4 (recompute + assert) so the H4 signature binding holds
 * by construction. Works in the browser and on the server (Web Crypto).
 */
export async function hashRecord(record: Record<string, unknown>): Promise<string> {
  const canonical = JSON.stringify(record, Object.keys(record).sort());
  const buf = new TextEncoder().encode(canonical);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
