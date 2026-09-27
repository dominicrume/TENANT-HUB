import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createPgliteClient } from "./pglite";
import {
  findProfileByEmail, setPasswordHash, createSession, findSessionByTokenHash, deleteSession, deleteAllSessionsForProfile,
  recordLoginAttempt, recentFailedAttempts, isLoginThrottled, LOGIN_THROTTLE, createPasswordReset, consumePasswordReset,
} from "../src/auth-store";

const root = (() => { let d = path.resolve(__dirname); while (!fs.existsSync(path.join(d, "pnpm-workspace.yaml"))) d = path.dirname(d); return d; })();
const migration = (f: string) => fs.readFileSync(path.join(root, "supabase/migrations", f), "utf-8").replace(/NOTIFY pgrst[^;]*;/g, "");

const PREREQ = `
CREATE SCHEMA IF NOT EXISTS auth; CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT NULL::uuid $$ LANGUAGE sql STABLE;
CREATE TYPE user_role AS ENUM ('manager','support_worker','tenant','admin');
CREATE TABLE organisations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE tenants (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID);
CREATE TABLE profiles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, role user_role NOT NULL DEFAULT 'support_worker', tenant_id UUID, email TEXT, full_name TEXT);
CREATE TABLE pending_invites (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL, role user_role NOT NULL, org_id UUID, tenant_id UUID, full_name TEXT, brand TEXT NOT NULL DEFAULT 'mattys_place', invited_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '14 days', consumed_at TIMESTAMPTZ);
`;

describe("auth-store on 040_own_sessions", () => {
  let db: Awaited<ReturnType<typeof createPgliteClient>>;
  let org: string, profileId: string;

  beforeAll(async () => {
    db = await createPgliteClient();
    await db.raw.exec(PREREQ);
    await db.raw.exec(migration("040_own_sessions.sql"));
    org = (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ('Matty''s Place') RETURNING id")).rows[0]!.id;
    profileId = (await db.query<{ id: string }>(
      "INSERT INTO profiles (org_id, role, email, full_name) VALUES ($1, 'manager', 'manager@example.com', 'Manager One') RETURNING id", [org])).rows[0]!.id;
  });
  afterAll(async () => { await db.end(); });

  it("finds a profile by email case-insensitively, and returns null for an unknown one", async () => {
    const found = await findProfileByEmail(db, "MANAGER@Example.com");
    expect(found?.id).toBe(profileId);
    expect(await findProfileByEmail(db, "nobody@example.com")).toBeNull();
  });

  it("sets and reads back a password hash", async () => {
    await setPasswordHash(db, profileId, "scrypt$fake$hash$for$this$test");
    const found = await findProfileByEmail(db, "manager@example.com");
    expect(found?.password_hash).toBe("scrypt$fake$hash$for$this$test");
  });

  describe("sessions", () => {
    it("creates a session and finds it by token hash", async () => {
      const { id, expiresAt } = await createSession(db, { profileId, tokenHash: "hash-1", ip: "203.0.113.1", userAgent: "test-agent" });
      expect(id).toBeTruthy();
      expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

      const found = await findSessionByTokenHash(db, "hash-1");
      expect(found).toMatchObject({ profileId, email: "manager@example.com", role: "manager" });
    });

    it("returns null for an unknown token", async () => {
      expect(await findSessionByTokenHash(db, "no-such-token")).toBeNull();
    });

    it("returns null for an expired session — it is not distinguishable from an unknown one to the caller", async () => {
      await db.query("INSERT INTO user_sessions (profile_id, token_hash, expires_at) VALUES ($1, $2, NOW() - INTERVAL '1 hour')", [profileId, "expired-hash"]);
      expect(await findSessionByTokenHash(db, "expired-hash")).toBeNull();
    });

    it("touches last_seen_at on lookup", async () => {
      await createSession(db, { profileId, tokenHash: "hash-touch" });
      const before = (await db.query<{ last_seen_at: string }>("SELECT last_seen_at FROM user_sessions WHERE token_hash = $1", ["hash-touch"])).rows[0]!.last_seen_at;
      await new Promise((r) => setTimeout(r, 5));
      await findSessionByTokenHash(db, "hash-touch");
      const after = (await db.query<{ last_seen_at: string }>("SELECT last_seen_at FROM user_sessions WHERE token_hash = $1", ["hash-touch"])).rows[0]!.last_seen_at;
      expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });

    it("deletes a single session by token", async () => {
      await createSession(db, { profileId, tokenHash: "hash-to-delete" });
      await deleteSession(db, "hash-to-delete");
      expect(await findSessionByTokenHash(db, "hash-to-delete")).toBeNull();
    });

    it("deletes every session for a profile — 'sign out everywhere' after a password reset", async () => {
      const other = (await db.query<{ id: string }>(
        "INSERT INTO profiles (org_id, role, email, full_name) VALUES ($1, 'manager', 'other@example.com', 'Other') RETURNING id", [org])).rows[0]!.id;
      await createSession(db, { profileId: other, tokenHash: "other-1" });
      await createSession(db, { profileId: other, tokenHash: "other-2" });
      await createSession(db, { profileId, tokenHash: "mine-untouched" });
      await deleteAllSessionsForProfile(db, other);
      expect(await findSessionByTokenHash(db, "other-1")).toBeNull();
      expect(await findSessionByTokenHash(db, "other-2")).toBeNull();
      expect(await findSessionByTokenHash(db, "mine-untouched")).not.toBeNull();
    });
  });

  describe("login throttle", () => {
    it("counts failures within the window, separately by email and by ip", async () => {
      const email = "throttle-target@example.com", ip = "198.51.100.7";
      for (let i = 0; i < 3; i++) await recordLoginAttempt(db, { email, ip, succeeded: false });
      await recordLoginAttempt(db, { email, ip, succeeded: true }); // a success does not count as a failure
      const counts = await recentFailedAttempts(db, { email, ip });
      expect(counts).toEqual({ byEmail: 3, byIp: 3 });
      expect(isLoginThrottled(counts)).toBe(false);
    });

    it("throttles once failures reach the threshold, by email even from a different ip", async () => {
      const email = "brute-forced@example.com";
      for (let i = 0; i < LOGIN_THROTTLE.maxFailuresByEmail; i++) await recordLoginAttempt(db, { email, ip: `10.0.0.${i}`, succeeded: false });
      const counts = await recentFailedAttempts(db, { email, ip: "10.0.0.99" });
      expect(counts.byEmail).toBe(LOGIN_THROTTLE.maxFailuresByEmail);
      expect(isLoginThrottled(counts)).toBe(true);
    });

    it("throttles by ip even across different email addresses — a spray attack", async () => {
      const ip = "203.0.113.50";
      for (let i = 0; i < LOGIN_THROTTLE.maxFailuresByIp; i++) await recordLoginAttempt(db, { email: `victim-${i}@example.com`, ip, succeeded: false });
      const counts = await recentFailedAttempts(db, { email: "yet-another@example.com", ip });
      expect(counts.byIp).toBe(LOGIN_THROTTLE.maxFailuresByIp);
      expect(isLoginThrottled(counts)).toBe(true);
    });

    it("does not count attempts outside the window", async () => {
      const email = "old-attempts@example.com", ip = "192.0.2.1";
      await db.query("INSERT INTO login_attempts (email, ip, succeeded, attempted_at) VALUES ($1, $2, false, NOW() - INTERVAL '1 day')", [email, ip]);
      const counts = await recentFailedAttempts(db, { email, ip, windowMs: 15 * 60 * 1000 });
      expect(counts).toEqual({ byEmail: 0, byIp: 0 });
    });
  });

  describe("password resets", () => {
    it("creates a reset token and consumes it exactly once", async () => {
      await createPasswordReset(db, { profileId, tokenHash: "reset-1" });
      const first = await consumePasswordReset(db, "reset-1");
      expect(first).toEqual({ profileId });
      const second = await consumePasswordReset(db, "reset-1");
      expect(second).toBeNull();
    });

    it("rejects an unknown token", async () => {
      expect(await consumePasswordReset(db, "never-issued")).toBeNull();
    });

    it("rejects an expired token", async () => {
      await createPasswordReset(db, { profileId, tokenHash: "reset-expired", ttlMs: -1000 });
      expect(await consumePasswordReset(db, "reset-expired")).toBeNull();
    });
  });
});
