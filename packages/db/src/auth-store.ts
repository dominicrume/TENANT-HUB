/**
 * Tenant Hub's own sessions, login throttling and password resets
 * (supabase/migrations/040_own_sessions.sql, BUILD_PLAN C31). Every function
 * takes the client so tests run on pglite; production passes db(). Hashing
 * (scrypt, tokens) lives in @tenant-hub/auth — this file only ever stores and
 * looks up hashes, never a plaintext password or a raw token.
 */
import type { Queryable } from "./pool";

export interface ProfileForLogin {
  id: string;
  email: string;
  password_hash: string | null;
  role: string;
  org_id: string | null;
  tenant_id: string | null;
  full_name: string;
}

export async function findProfileByEmail(client: Queryable, email: string): Promise<ProfileForLogin | null> {
  const r = await client.query<ProfileForLogin>(
    "SELECT id, email, password_hash, role, org_id, tenant_id, full_name FROM profiles WHERE lower(email) = lower($1) LIMIT 1", [email]);
  return r.rows[0] ?? null;
}

export async function setPasswordHash(client: Queryable, profileId: string, hash: string): Promise<void> {
  await client.query("UPDATE profiles SET password_hash = $2 WHERE id = $1", [profileId, hash]);
}

/* ── Sessions ──────────────────────────────────────────────────────────── */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface CreateSessionInput { profileId: string; tokenHash: string; ip?: string | null; userAgent?: string | null; ttlMs?: number }

export async function createSession(client: Queryable, i: CreateSessionInput): Promise<{ id: string; expiresAt: string }> {
  const r = await client.query<{ id: string; expires_at: string }>(
    `INSERT INTO user_sessions (profile_id, token_hash, ip, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + ($5 || ' milliseconds')::interval)
     RETURNING id, expires_at`,
    [i.profileId, i.tokenHash, i.ip ?? null, i.userAgent ?? null, String(i.ttlMs ?? SESSION_TTL_MS)]);
  const row = r.rows[0]!;
  return { id: row.id, expiresAt: row.expires_at };
}

export interface SessionProfile { profileId: string; email: string; role: string; orgId: string | null; tenantId: string | null; fullName: string }

/** Looks up a live (unexpired) session and touches last_seen_at. Returns null for an expired or unknown token — the caller treats both the same: not signed in. */
export async function findSessionByTokenHash(client: Queryable, tokenHash: string): Promise<SessionProfile | null> {
  const r = await client.query<{ profile_id: string; email: string; role: string; org_id: string | null; tenant_id: string | null; full_name: string }>(
    `UPDATE user_sessions s SET last_seen_at = NOW()
     FROM profiles p
     WHERE s.token_hash = $1 AND s.profile_id = p.id AND s.expires_at > NOW()
     RETURNING p.id AS profile_id, p.email, p.role, p.org_id, p.tenant_id, p.full_name`,
    [tokenHash]);
  const row = r.rows[0];
  if (!row) return null;
  return { profileId: row.profile_id, email: row.email, role: row.role, orgId: row.org_id, tenantId: row.tenant_id, fullName: row.full_name };
}

export async function deleteSession(client: Queryable, tokenHash: string): Promise<void> {
  await client.query("DELETE FROM user_sessions WHERE token_hash = $1", [tokenHash]);
}

/** Every device signed out — used after a password change/reset, so a stolen old session dies with it. */
export async function deleteAllSessionsForProfile(client: Queryable, profileId: string): Promise<void> {
  await client.query("DELETE FROM user_sessions WHERE profile_id = $1", [profileId]);
}

/* ── Login throttle ───────────────────────────────────────────────────────
 * Postgres, not Upstash (BUILD_PLAN C31) — one less external dependency, and
 * the attempt log doubles as an audit trail of who tried to sign in from where. */
export const LOGIN_THROTTLE = { maxFailuresByEmail: 5, maxFailuresByIp: 20, windowMs: 15 * 60 * 1000 };

export async function recordLoginAttempt(client: Queryable, i: { email: string; ip: string; succeeded: boolean }): Promise<void> {
  await client.query("INSERT INTO login_attempts (email, ip, succeeded) VALUES ($1, $2, $3)", [i.email.trim().toLowerCase(), i.ip, i.succeeded]);
}

export interface RecentFailures { byEmail: number; byIp: number }

export async function recentFailedAttempts(client: Queryable, i: { email: string; ip: string; windowMs?: number }): Promise<RecentFailures> {
  const window = String(i.windowMs ?? LOGIN_THROTTLE.windowMs);
  const [byEmail, byIp] = await Promise.all([
    client.query<{ n: string | number }>(
      "SELECT count(*) n FROM login_attempts WHERE lower(email) = lower($1) AND succeeded = false AND attempted_at > NOW() - ($2 || ' milliseconds')::interval",
      [i.email, window]),
    client.query<{ n: string | number }>(
      "SELECT count(*) n FROM login_attempts WHERE ip = $1 AND succeeded = false AND attempted_at > NOW() - ($2 || ' milliseconds')::interval",
      [i.ip, window]),
  ]);
  return { byEmail: Number(byEmail.rows[0]?.n ?? 0), byIp: Number(byIp.rows[0]?.n ?? 0) };
}

/** Pure decision — kept separate from the query so it's trivially unit-testable. */
export function isLoginThrottled(f: RecentFailures): boolean {
  return f.byEmail >= LOGIN_THROTTLE.maxFailuresByEmail || f.byIp >= LOGIN_THROTTLE.maxFailuresByIp;
}

/* ── Password resets ──────────────────────────────────────────────────── */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function createPasswordReset(client: Queryable, i: { profileId: string; tokenHash: string; ttlMs?: number }): Promise<void> {
  await client.query(
    `INSERT INTO password_resets (profile_id, token_hash, expires_at) VALUES ($1, $2, NOW() + ($3 || ' milliseconds')::interval)`,
    [i.profileId, i.tokenHash, String(i.ttlMs ?? PASSWORD_RESET_TTL_MS)]);
}

/** Atomically claims the token — a concurrent second use of the same link finds it already consumed. */
export async function consumePasswordReset(client: Queryable, tokenHash: string): Promise<{ profileId: string } | null> {
  const r = await client.query<{ profile_id: string }>(
    `UPDATE password_resets SET consumed_at = NOW()
     WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > NOW()
     RETURNING profile_id`, [tokenHash]);
  return r.rows[0] ? { profileId: r.rows[0].profile_id } : null;
}
