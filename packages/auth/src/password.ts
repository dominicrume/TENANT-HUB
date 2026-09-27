/**
 * Password hashing and one-time tokens for Tenant Hub's own sessions
 * (BUILD_PLAN C31) — replacing Supabase Auth, which today does all of this
 * inside a black box we don't control.
 *
 * scrypt (Node's own `crypto.scrypt`, no dependency) is the ONLY algorithm
 * this system ever writes. bcrypt verification exists for exactly one
 * purpose: an account created back when Supabase Auth managed it has a
 * bcrypt hash in `auth.users.encrypted_password`, imported once into
 * `profiles.password_hash` as-is. The first time that person logs in here,
 * `verifyPassword` recognises the bcrypt prefix, verifies against it, and
 * tells the caller to re-hash with scrypt and overwrite it — so every
 * account is on scrypt within one login, and bcrypt is never written again.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash, type ScryptOptions } from "node:crypto";
import bcrypt from "bcryptjs";

/** util.promisify only resolves scrypt's no-options overload; this one keeps the cost-factor options. */
function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derivedKey) => (err ? reject(err) : resolve(derivedKey)));
  });
}

const SCRYPT_N = 16384; // 2^14 — Node's documented default cost factor
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

/** `scrypt$N$r$p$saltHex$hashHex` — self-describing, so the cost factors can change later without breaking existing hashes. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(plain, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export interface VerifyResult {
  valid: boolean;
  /** true when verified against a legacy bcrypt hash — the caller must re-hash with scrypt and save it. */
  needsRehash: boolean;
}

const INVALID: VerifyResult = { valid: false, needsRehash: false };

export async function verifyPassword(plain: string, stored: string | null | undefined): Promise<VerifyResult> {
  if (!stored) return INVALID;

  if (stored.startsWith("scrypt$")) {
    const parts = stored.split("$");
    if (parts.length !== 6) return INVALID;
    const [, nStr, rStr, pStr, saltHex, hashHex] = parts as [string, string, string, string, string, string];
    const N = Number(nStr), r = Number(rStr), p = Number(pStr);
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = await scrypt(plain, salt, expected.length, { N, r, p });
    const valid = derived.length === expected.length && timingSafeEqual(derived, expected);
    return { valid, needsRehash: false };
  }

  // bcrypt hashes are self-describing: $2a$, $2b$ or $2y$.
  if (/^\$2[aby]\$/.test(stored)) {
    const valid = await bcrypt.compare(plain, stored);
    return { valid, needsRehash: valid };
  }

  return INVALID;
}

/** A random, unguessable token for a session cookie, an invite link or a password-reset link.
 *  The raw value goes to the browser / the email; only its hash (below) is ever stored. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 is fine here — this hashes an already-high-entropy random token for lookup, not a
 *  human password, so scrypt's deliberate slowness would only be self-inflicted latency. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
