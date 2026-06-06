/**
 * Isomorphic Cryptographic Hashing (Web Crypto API)
 * Safe for Edge, Browser, and Node.js (18+) runtimes.
 */

export async function hashFact(factText: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(factText.trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Creates a unique short-hash (first 12 chars) for visual provenance
 */
export async function shortHashFact(factText: string): Promise<string> {
  const full = await hashFact(factText);
  return full.slice(0, 12);
}
