/**
 * Access requests (migration 055): someone without an account asks to join
 * an organisation; a manager there approves (which issues the invite) or
 * declines. Invite-only is preserved — this is the queue in front of it.
 */
import type { Queryable } from "./pool";

export interface AccessRequestRow {
  id: string; orgId: string; fullName: string; email: string; phone: string | null; roleWanted: string; message: string | null;
  status: "pending" | "approved" | "declined"; createdAt: string;
}
type Raw = { id: string; org_id: string; full_name: string; email: string; phone: string | null; role_wanted: string; message: string | null; status: AccessRequestRow["status"]; created_at: string };
const map = (r: Raw): AccessRequestRow => ({ id: r.id, orgId: r.org_id, fullName: r.full_name, email: r.email, phone: r.phone, roleWanted: r.role_wanted, message: r.message, status: r.status, createdAt: r.created_at });

export async function insertAccessRequest(client: Queryable, i: { orgId: string; fullName: string; email: string; phone?: string | null; roleWanted: string; message?: string | null }): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO access_requests (org_id, full_name, email, phone, role_wanted, message) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [i.orgId, i.fullName, i.email, i.phone ?? null, i.roleWanted, i.message ?? null]);
  return r.rows[0]!.id;
}

/** A pending request from the same email to the same org is not a new request. */
export async function hasPendingAccessRequest(client: Queryable, i: { orgId: string; email: string }): Promise<boolean> {
  const r = await client.query("SELECT 1 FROM access_requests WHERE org_id = $1 AND lower(email) = lower($2) AND status = 'pending'", [i.orgId, i.email]);
  return (r.rowCount ?? 0) > 0;
}

export async function listAccessRequests(client: Queryable, orgId: string, status: AccessRequestRow["status"] = "pending"): Promise<AccessRequestRow[]> {
  const r = await client.query<Raw>("SELECT * FROM access_requests WHERE org_id = $1 AND status = $2 ORDER BY created_at DESC", [orgId, status]);
  return r.rows.map(map);
}

export async function findAccessRequest(client: Queryable, i: { id: string; orgId: string }): Promise<AccessRequestRow | null> {
  const r = await client.query<Raw>("SELECT * FROM access_requests WHERE id = $1 AND org_id = $2", [i.id, i.orgId]);
  return r.rows[0] ? map(r.rows[0]) : null;
}

export async function decideAccessRequest(client: Queryable, i: { id: string; orgId: string; status: "approved" | "declined"; decidedBy: string }): Promise<boolean> {
  const r = await client.query(
    "UPDATE access_requests SET status = $3, decided_by = $4, decided_at = NOW() WHERE id = $1 AND org_id = $2 AND status = 'pending'",
    [i.id, i.orgId, i.status, i.decidedBy]);
  return (r.rowCount ?? 0) > 0;
}

/** Organisation names only — what the public "request access" form needs to offer. */
export async function listOrganisationNames(client: Queryable): Promise<Array<{ id: string; name: string }>> {
  const r = await client.query<{ id: string; name: string }>("SELECT id, name FROM organisations ORDER BY name");
  return r.rows;
}

/** Who to tell about a new request. */
export async function managerEmailsForOrg(client: Queryable, orgId: string): Promise<string[]> {
  const r = await client.query<{ email: string }>(
    `SELECT DISTINCT p.email FROM profiles p
     WHERE p.email IS NOT NULL AND p.role IN ('manager','admin')
       AND (p.org_id = $1 OR p.id IN (SELECT profile_id FROM profile_organisations WHERE org_id = $1))`, [orgId]);
  return r.rows.map((x) => x.email);
}
