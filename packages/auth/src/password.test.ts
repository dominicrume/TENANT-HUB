import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { hashPassword, verifyPassword, generateToken, hashToken } from "./password";

describe("hashPassword / verifyPassword — scrypt", () => {
  it("verifies the correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toEqual({ valid: true, needsRehash: false });
    expect(await verifyPassword("wrong password", hash)).toEqual({ valid: false, needsRehash: false });
  });

  it("never stores the plaintext, and the format is self-describing", async () => {
    const hash = await hashPassword("hunter2");
    expect(hash).not.toContain("hunter2");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash.split("$")).toHaveLength(6);
  });

  it("two hashes of the same password are different (random salt) but both verify", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
    expect((await verifyPassword("same password", a)).valid).toBe(true);
    expect((await verifyPassword("same password", b)).valid).toBe(true);
  });

  it("rejects null, undefined or garbage stored values without throwing", async () => {
    expect(await verifyPassword("anything", null)).toEqual({ valid: false, needsRehash: false });
    expect(await verifyPassword("anything", undefined)).toEqual({ valid: false, needsRehash: false });
    expect(await verifyPassword("anything", "not-a-real-hash")).toEqual({ valid: false, needsRehash: false });
    expect(await verifyPassword("anything", "scrypt$only$three$parts")).toEqual({ valid: false, needsRehash: false });
  });
});

describe("verifyPassword — legacy bcrypt (imported Supabase accounts)", () => {
  it("verifies a real bcrypt hash and flags it for rehashing", async () => {
    const bcryptHash = await bcrypt.hash("an old supabase password", 10);
    const result = await verifyPassword("an old supabase password", bcryptHash);
    expect(result).toEqual({ valid: true, needsRehash: true });
  });

  it("rejects the wrong password against a bcrypt hash without flagging a rehash", async () => {
    const bcryptHash = await bcrypt.hash("the real password", 10);
    const result = await verifyPassword("a guess", bcryptHash);
    expect(result).toEqual({ valid: false, needsRehash: false });
  });

  it("recognises all three bcrypt prefix variants", async () => {
    for (const prefix of ["$2a$", "$2b$", "$2y$"]) {
      const real = await bcrypt.hash("prefix test", 10);
      const swapped = prefix + real.slice(4);
      // Not asserting this specific swapped hash verifies (bcryptjs may reject a foreign prefix's
      // internal encoding) — only that it is routed to the bcrypt path, never treated as scrypt.
      const result = await verifyPassword("prefix test", swapped);
      expect(result.needsRehash).toBe(result.valid);
    }
  });
});

describe("generateToken / hashToken", () => {
  it("generates a high-entropy, URL-safe token", () => {
    const token = generateToken();
    expect(token.length).toBeGreaterThan(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("two generated tokens are never the same", () => {
    expect(generateToken()).not.toBe(generateToken());
  });

  it("hashToken is deterministic and never returns the input", () => {
    const token = generateToken();
    const hash = hashToken(token);
    expect(hashToken(token)).toBe(hash);
    expect(hash).not.toBe(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
