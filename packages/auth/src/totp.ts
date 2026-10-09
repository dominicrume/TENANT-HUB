/**
 * TOTP (RFC 6238) on HOTP (RFC 4226), SHA-1, 6 digits, 30-second steps —
 * what Google Authenticator, Authy, 1Password and Microsoft Authenticator
 * all speak. Implemented on node:crypto directly: ~60 lines is not worth a
 * dependency in the package that guards every login.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** 160-bit secret, base32 — the string the authenticator app stores. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: string, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const code = ((mac[offset]! & 0x7f) << 24) | ((mac[offset + 1]! & 0xff) << 16) | ((mac[offset + 2]! & 0xff) << 8) | (mac[offset + 3]! & 0xff);
  return String(code % 10 ** digits).padStart(digits, "0");
}

export function totp(secret: string, atMs: number = Date.now(), stepSeconds = 30): string {
  return hotp(secret, Math.floor(atMs / 1000 / stepSeconds));
}

/** Accepts the current step and one either side (clock drift). Constant-time compare. */
export function verifyTotp(secret: string, code: string, atMs: number = Date.now(), window = 1): boolean {
  const given = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(given)) return false;
  const step = Math.floor(atMs / 1000 / 30);
  for (let i = -window; i <= window; i++) {
    const expected = hotp(secret, step + i);
    if (expected.length === given.length && timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return true;
  }
  return false;
}

/** otpauth:// URI the authenticator app's QR encodes. */
export function totpUri(secret: string, accountLabel: string, issuer = "Tenant Hub"): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** Eight one-use recovery codes, shown once; the caller stores their hashes. */
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const hex = randomBytes(5).toString("hex");
    return `${hex.slice(0, 5)}-${hex.slice(5)}`;
  });
}
