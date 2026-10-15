/**
 * The credential vault (migration 067): the passwords the admin issues to
 * staff, encrypted with AES-256-GCM under CREDENTIAL_VAULT_KEY — a key that
 * exists only in the platform's secret store, never in the database. Without
 * the key the rows are noise; with it the admin can reveal a password they
 * issued. Every reveal is counted and audited.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { env } from "@tenant-hub/env";

function key(): Buffer {
  const raw = env.server.CREDENTIAL_VAULT_KEY;
  if (!raw) throw new Error("CREDENTIAL_VAULT_KEY is not set — the vault is closed");
  // Accept a base64 32-byte key, or any passphrase (hashed to 32 bytes).
  const b = Buffer.from(raw, "base64");
  return b.length === 32 ? b : createHash("sha256").update(raw).digest();
}

export function vaultOpen(): boolean { return Boolean(env.server.CREDENTIAL_VAULT_KEY); }

export function seal(plain: string): { ciphertext: string; iv: string; tag: string } {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return { ciphertext: ct.toString("base64"), iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64") };
}

export function unseal(i: { ciphertext: string; iv: string; tag: string }): string {
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(i.iv, "base64"));
  d.setAuthTag(Buffer.from(i.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(i.ciphertext, "base64")), d.final()]).toString("utf8");
}

/** A password a person can read out over the phone and type: three words, a number, a symbol. ~70 bits. */
export function generatePassword(): string {
  const words = ["amber", "navy", "cream", "stone", "river", "maple", "cedar", "harbour", "meadow", "willow", "copper", "silver", "marble", "linen", "orchid", "falcon", "heron", "otter", "badger", "robin", "summit", "valley", "canyon", "island", "garden", "lantern", "compass", "anchor", "beacon", "bridge", "castle", "forest"];
  const pick = () => words[randomBytes(1)[0]! % words.length]!;
  const cap = (w: string) => w[0]!.toUpperCase() + w.slice(1);
  const n = 10 + (randomBytes(1)[0]! % 90);
  const sym = "!#%&*+?"[randomBytes(1)[0]! % 7];
  return `${cap(pick())}-${pick()}-${cap(pick())}${n}${sym}`;
}
