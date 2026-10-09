/**
 * Tenant referencing (migration 052): a referee answers a one-shot link,
 * no account. Tokens are stored hashed, same as sessions and invites.
 */
import type { Queryable } from "./pool";

export type ReferenceKind = "previous_landlord" | "employer" | "support_worker" | "character";
export type ReferenceStatus = "requested" | "received" | "declined";

export interface ReferenceRow {
  id: string; tenantId: string; kind: ReferenceKind; refereeName: string; refereeEmail: string; status: ReferenceStatus;
  decision: "positive" | "negative" | "unable" | null; response: string | null; notifiedAt: string | null; respondedAt: string | null;
  expiresAt: string; requestedBy: string; createdAt: string;
}

type Raw = { id: string; tenant_id: string; kind: ReferenceKind; referee_name: string; referee_email: string; status: ReferenceStatus; decision: ReferenceRow["decision"];
  response: string | null; notified_at: string | null; responded_at: string | null; expires_at: string; requested_by: string; created_at: string };
const map = (r: Raw): ReferenceRow => ({ id: r.id, tenantId: r.tenant_id, kind: r.kind, refereeName: r.referee_name, refereeEmail: r.referee_email, status: r.status,
  decision: r.decision, response: r.response, notifiedAt: r.notified_at, respondedAt: r.responded_at, expiresAt: r.expires_at, requestedBy: r.requested_by, createdAt: r.created_at });

export async function listReferences(client: Queryable, i: { orgId: string; tenantId: string }): Promise<ReferenceRow[]> {
  const r = await client.query<Raw>(
    `SELECT id, tenant_id, kind, referee_name, referee_email, status, decision, response, notified_at, responded_at, expires_at, requested_by, created_at
     FROM tenant_references WHERE org_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`, [i.orgId, i.tenantId]);
  return r.rows.map(map);
}

export async function insertReference(client: Queryable, i: { orgId: string; tenantId: string; kind: ReferenceKind; refereeName: string; refereeEmail: string; tokenHash: string; requestedBy: string; ttlDays?: number }): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO tenant_references (org_id, tenant_id, kind, referee_name, referee_email, token_hash, requested_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + ($8 || ' days')::interval) RETURNING id`,
    [i.orgId, i.tenantId, i.kind, i.refereeName, i.refereeEmail, i.tokenHash, i.requestedBy, String(i.ttlDays ?? 21)]);
  return r.rows[0]!.id;
}

export async function markReferenceNotified(client: Queryable, id: string): Promise<void> {
  await client.query("UPDATE tenant_references SET notified_at = NOW() WHERE id = $1", [id]);
}

/** What the referee sees — the tenant's first name only, the kind, and who's asking. Null if unknown/expired/answered. */
export async function findReferenceByTokenHash(client: Queryable, tokenHash: string): Promise<{ id: string; kind: ReferenceKind; refereeName: string; tenantFirstName: string; orgName: string; status: ReferenceStatus } | null> {
  const r = await client.query<{ id: string; kind: ReferenceKind; referee_name: string; full_name: string; org_name: string; status: ReferenceStatus }>(
    `SELECT tr.id, tr.kind, tr.referee_name, t.full_name, o.name AS org_name, tr.status
     FROM tenant_references tr JOIN tenants t ON t.id = tr.tenant_id JOIN organisations o ON o.id = tr.org_id
     WHERE tr.token_hash = $1 AND tr.expires_at > NOW()`, [tokenHash]);
  const row = r.rows[0];
  if (!row) return null;
  return { id: row.id, kind: row.kind, refereeName: row.referee_name, tenantFirstName: row.full_name.split(/\s+/)[0] ?? "the tenant", orgName: row.org_name, status: row.status };
}

/** Records the answer and burns the link. */
export async function respondToReference(client: Queryable, i: { tokenHash: string; decision: "positive" | "negative" | "unable"; response: string }): Promise<boolean> {
  const r = await client.query(
    `UPDATE tenant_references SET status = 'received', decision = $2, response = $3, responded_at = NOW(), token_hash = 'used:' || id::text
     WHERE token_hash = $1 AND status = 'requested' AND expires_at > NOW()`, [i.tokenHash, i.decision, i.response]);
  return (r.rowCount ?? 0) > 0;
}
