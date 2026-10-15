/**
 * Issued credentials (migration 067) — the record of every password the admin
 * has handed to a member of staff, encrypted by the caller (packages/db never
 * sees the key). One active row per profile; a new password supersedes the old.
 */
import type { Queryable } from "./pool";

export interface IssuedCredentialRow {
  id: string; profile_id: string; email: string; ciphertext: string; iv: string; tag: string;
  issued_by_name: string | null; issued_at: string; last_revealed_at: string | null; reveal_count: number;
}

/** Creates the account itself with a password hash — the admin-issued path (no invite acceptance step). */
export async function createProfileWithPassword(client: Queryable, i: { email: string; fullName: string; role: string; orgId: string; brand: string | null; tenantId?: string | null; passwordHash: string }): Promise<{ id: string }> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO profiles (full_name, role, email, org_id, tenant_id, brand, password_hash)
     VALUES ($1, $2, lower($3), $4, $5, COALESCE($6, 'mattys_place'), $7) RETURNING id`,
    [i.fullName, i.role, i.email, i.orgId, i.tenantId ?? null, i.brand, i.passwordHash]);
  return r.rows[0]!;
}

export async function activeCredential(client: Queryable, profileId: string): Promise<IssuedCredentialRow | null> {
  const r = await client.query<IssuedCredentialRow>(
    "SELECT id, profile_id, email, ciphertext, iv, tag, issued_by_name, issued_at, last_revealed_at, reveal_count FROM issued_credentials WHERE profile_id = $1 AND superseded_at IS NULL ORDER BY issued_at DESC LIMIT 1", [profileId]);
  return r.rows[0] ?? null;
}

export async function supersedeCredentials(client: Queryable, profileId: string): Promise<void> {
  await client.query("UPDATE issued_credentials SET superseded_at = NOW() WHERE profile_id = $1 AND superseded_at IS NULL", [profileId]);
}

/** Which of this organisation's people have an issued password on record (so the list can say "issued by X on date"). */
export async function credentialSummaries(client: Queryable, orgId: string): Promise<Array<{ profile_id: string; issued_by_name: string | null; issued_at: string; reveal_count: number; last_revealed_at: string | null }>> {
  const r = await client.query<{ profile_id: string; issued_by_name: string | null; issued_at: string; reveal_count: number; last_revealed_at: string | null }>(
    "SELECT profile_id, issued_by_name, issued_at, reveal_count, last_revealed_at FROM issued_credentials WHERE org_id = $1 AND superseded_at IS NULL", [orgId]);
  return r.rows;
}
