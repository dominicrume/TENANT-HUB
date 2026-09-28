import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createPgliteClient } from "./pglite";
import { createInvite, attachInviteToken, findLiveInvite, acceptInvite, findProfileByEmail } from "../src/auth-store";

const root = (() => { let d = path.resolve(__dirname); while (!fs.existsSync(path.join(d, "pnpm-workspace.yaml"))) d = path.dirname(d); return d; })();
const migration = (f: string) => fs.readFileSync(path.join(root, "supabase/migrations", f), "utf-8").replace(/NOTIFY pgrst[^;]*;/g, "");

// profiles here has the REAL original shape — id is a foreign key to auth.users — so 041 is proven to actually remove that dependency.
const PREREQ = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TYPE user_role AS ENUM ('manager','support_worker','tenant','admin');
CREATE TABLE organisations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL);
CREATE TABLE tenants (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID);
CREATE TABLE profiles (id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY, full_name TEXT NOT NULL, role user_role NOT NULL DEFAULT 'support_worker',
  email TEXT, org_id UUID, tenant_id UUID, brand TEXT NOT NULL DEFAULT 'mattys_place');
CREATE TABLE pending_invites (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL, role user_role NOT NULL, org_id UUID, tenant_id UUID, full_name TEXT,
  brand TEXT NOT NULL DEFAULT 'mattys_place', invited_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '14 days', consumed_at TIMESTAMPTZ);
CREATE UNIQUE INDEX pending_invites_email_live_idx ON pending_invites (lower(email)) WHERE consumed_at IS NULL;
`;

describe("own invites on 040 + 041", () => {
  let db: Awaited<ReturnType<typeof createPgliteClient>>;
  let org: string;

  beforeAll(async () => {
    db = await createPgliteClient();
    await db.raw.exec(PREREQ);
    await db.raw.exec(migration("040_own_sessions.sql"));
    await db.raw.exec(migration("041_profiles_own_identity.sql"));
    org = (await db.query<{ id: string }>("INSERT INTO organisations (name) VALUES ('Matty''s Place') RETURNING id")).rows[0]!.id;
  });
  afterAll(async () => { await db.end(); });

  const invite = async (email: string, role = "support_worker") =>
    db.query("INSERT INTO pending_invites (email, role, org_id, full_name) VALUES ($1, $2, $3, 'Invited Person')", [email, role, org]);

  it("041 lets a profile exist with no auth.users row at all", async () => {
    const r = await db.query<{ id: string }>("INSERT INTO profiles (full_name, role, email) VALUES ('Standalone', 'manager', 'standalone@example.com') RETURNING id");
    expect(r.rows[0]!.id).toBeTruthy();
  });

  it("041 keeps one profile per email, case-insensitively", async () => {
    await db.query("INSERT INTO profiles (full_name, email) VALUES ('First', 'dupe@example.com')");
    await expect(db.query("INSERT INTO profiles (full_name, email) VALUES ('Second', 'DUPE@example.com')")).rejects.toThrow();
  });

  it("attaches a token to the live invite, and finds it by that token", async () => {
    await invite("alice@example.com");
    expect(await attachInviteToken(db, { email: "ALICE@example.com", tokenHash: "tok-alice" })).toBe(true);
    const found = await findLiveInvite(db, "tok-alice");
    expect(found).toMatchObject({ email: "alice@example.com", role: "support_worker", org_id: org, full_name: "Invited Person" });
  });

  it("refuses to attach a token when there is no live invite for that email", async () => {
    expect(await attachInviteToken(db, { email: "nobody@example.com", tokenHash: "tok-x" })).toBe(false);
  });

  it("accepting creates the profile with the role, org and password hash from the invite, and burns the token", async () => {
    await invite("bob@example.com", "manager");
    await attachInviteToken(db, { email: "bob@example.com", tokenHash: "tok-bob" });

    const accepted = await acceptInvite(db, { tokenHash: "tok-bob", passwordHash: "scrypt$fake$hash" });
    expect(accepted?.role).toBe("manager");

    const profile = await findProfileByEmail(db, "bob@example.com");
    expect(profile).toMatchObject({ role: "manager", org_id: org, password_hash: "scrypt$fake$hash" });
    expect(await findLiveInvite(db, "tok-bob")).toBeNull();
    expect(await acceptInvite(db, { tokenHash: "tok-bob", passwordHash: "scrypt$again" })).toBeNull(); // single use
  });

  it("does not burn the invite when the profile cannot be created — the person can still try again", async () => {
    await db.query("INSERT INTO profiles (full_name, email) VALUES ('Already Here', 'carol@example.com')");
    await invite("carol@example.com");
    await attachInviteToken(db, { email: "carol@example.com", tokenHash: "tok-carol" });

    await expect(acceptInvite(db, { tokenHash: "tok-carol", passwordHash: "scrypt$x" })).rejects.toThrow();
    expect(await findLiveInvite(db, "tok-carol")).not.toBeNull(); // rolled back with the failed insert
  });

  it("rejects an expired invite", async () => {
    await invite("dave@example.com");
    await attachInviteToken(db, { email: "dave@example.com", tokenHash: "tok-dave", ttlMs: -1000 });
    expect(await findLiveInvite(db, "tok-dave")).toBeNull();
    expect(await acceptInvite(db, { tokenHash: "tok-dave", passwordHash: "scrypt$x" })).toBeNull();
  });

  it("createInvite replaces an outstanding invite for the same email rather than stacking a second", async () => {
    await createInvite(db, { email: "Erin@Example.com", role: "support_worker", orgId: org, fullName: "Erin One" });
    await createInvite(db, { email: "erin@example.com", role: "manager", orgId: org, fullName: "Erin Two" });
    const rows = (await db.query<{ role: string; full_name: string }>("SELECT role, full_name FROM pending_invites WHERE lower(email) = 'erin@example.com' AND consumed_at IS NULL")).rows;
    expect(rows).toEqual([{ role: "manager", full_name: "Erin Two" }]);
  });
});
