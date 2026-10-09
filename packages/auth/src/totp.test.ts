import { describe, it, expect } from "vitest";
import { base32Encode, base32Decode, hotp, totp, verifyTotp, totpUri, generateTotpSecret, generateRecoveryCodes } from "./totp";

// RFC 6238 Appendix B test vectors (SHA-1): secret "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
  it("round-trips base32", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(RFC_SECRET).toString()).toBe("12345678901234567890");
  });
  it("matches the RFC vectors at T=59, 1111111109, 1234567890 (8→6 digit truncation)", () => {
    expect(totp(RFC_SECRET, 59 * 1000)).toBe("287082");
    expect(totp(RFC_SECRET, 1111111109 * 1000)).toBe("081804");
    expect(totp(RFC_SECRET, 1234567890 * 1000)).toBe("005924");
    expect(hotp(RFC_SECRET, 1)).toBe("287082");
  });
  it("verifies the current code, tolerates one step of drift, rejects garbage and old codes", () => {
    const at = 1234567890 * 1000;
    expect(verifyTotp(RFC_SECRET, "005924", at)).toBe(true);
    expect(verifyTotp(RFC_SECRET, "005 924", at)).toBe(true);           // spaces as apps display them
    expect(verifyTotp(RFC_SECRET, "005924", at + 30_000)).toBe(true);   // one step later still accepted
    expect(verifyTotp(RFC_SECRET, "005924", at + 90_000)).toBe(false);  // three steps later: no
    expect(verifyTotp(RFC_SECRET, "abcdef", at)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "", at)).toBe(false);
  });
  it("generates a 32-char base32 secret and a well-formed otpauth URI", () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(totpUri(s, "manager@example.com")).toBe(`otpauth://totp/Tenant%20Hub%3Amanager%40example.com?secret=${s}&issuer=Tenant%20Hub&algorithm=SHA1&digits=6&period=30`);
  });
  it("recovery codes are eight, unique, xxxxx-xxxxx", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    expect(codes.every((c) => /^[0-9a-f]{5}-[0-9a-f]{5}$/.test(c))).toBe(true);
  });
});
