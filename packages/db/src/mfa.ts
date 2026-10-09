/**
 * MFA state on profiles + one-shot login challenges (migration 052).
 * Secrets are stored as the base32 string the authenticator app holds;
 * recovery codes only as hashes. A challenge is the bridge between "password
 * accepted" and "code accepted": hashed, 5 minutes, used once.
 */
import type { Queryable } from "./pool";

export interface MfaState { enabled: boolean; secret: string | null; pendingSecret: string | null; recoveryHashes: string[] }

export async function getMfaState(client: Queryable, profileId: string): Promise<MfaState> {
  const r = await client.query<{ totp_secret: string | null; totp_pending_secret: string | null; totp_enabled_at: string | null; totp_recovery_hashes: string[] | null }>(
    "SELECT totp_secret, totp_pending_secret, totp_enabled_at, totp_recovery_hashes FROM profiles WHERE id = $1", [profileId]);
  const row = r.rows[0];
  return {
    enabled: Boolean(row?.totp_enabled_at && row?.totp_secret),
    secret: row?.totp_secret ?? null,
    pendingSecret: row?.totp_pending_secret ?? null,
    recoveryHashes: row?.totp_recovery_hashes ?? [],
  };
}

export async function setPendingTotpSecret(client: Queryable, profileId: string, secret: string): Promise<void> {
  await client.query("UPDATE profiles SET totp_pending_secret = $2 WHERE id = $1", [profileId, secret]);
}

/** Pending → live, with the recovery-code hashes. Called only after the person proved a code from that secret. */
export async function enableTotp(client: Queryable, profileId: string, recoveryHashes: string[]): Promise<void> {
  await client.query(
    `UPDATE profiles SET totp_secret = totp_pending_secret, totp_pending_secret = NULL, totp_enabled_at = NOW(), totp_recovery_hashes = $2
     WHERE id = $1 AND totp_pending_secret IS NOT NULL`,
    [profileId, recoveryHashes]);
}

export async function disableTotp(client: Queryable, profileId: string): Promise<void> {
  await client.query("UPDATE profiles SET totp_secret = NULL, totp_pending_secret = NULL, totp_enabled_at = NULL, totp_recovery_hashes = '{}' WHERE id = $1", [profileId]);
}

/** Burns one recovery code. True only if that hash was present and is now gone. */
export async function consumeRecoveryCode(client: Queryable, profileId: string, hash: string): Promise<boolean> {
  const r = await client.query(
    "UPDATE profiles SET totp_recovery_hashes = array_remove(totp_recovery_hashes, $2) WHERE id = $1 AND $2 = ANY(totp_recovery_hashes)",
    [profileId, hash]);
  return (r.rowCount ?? 0) > 0;
}

export async function createMfaChallenge(client: Queryable, i: { profileId: string; tokenHash: string; ttlMs?: number }): Promise<void> {
  await client.query("INSERT INTO mfa_challenges (profile_id, token_hash, expires_at) VALUES ($1, $2, NOW() + ($3 || ' milliseconds')::interval)",
    [i.profileId, i.tokenHash, String(i.ttlMs ?? 5 * 60 * 1000)]);
}

/** Looks up a live challenge WITHOUT consuming it (a wrong code must not burn the challenge). */
export async function findMfaChallenge(client: Queryable, tokenHash: string): Promise<{ profileId: string } | null> {
  const r = await client.query<{ profile_id: string }>("SELECT profile_id FROM mfa_challenges WHERE token_hash = $1 AND expires_at > NOW()", [tokenHash]);
  return r.rows[0] ? { profileId: r.rows[0].profile_id } : null;
}

export async function consumeMfaChallenge(client: Queryable, tokenHash: string): Promise<void> {
  await client.query("DELETE FROM mfa_challenges WHERE token_hash = $1 OR expires_at <= NOW()", [tokenHash]);
}
