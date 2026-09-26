/**
 * Shared helpers for agents. Mandate and receipt primitives come from
 * @tenant-hub/kya; the notifier from @tenant-hub/adapters; lookups here.
 */
import type { Queryable } from "@tenant-hub/db";
export { mandate, read, refuse, newReceipt as receipt, withOutcome, type ActionReceipt, type AgentMandate } from "@tenant-hub/kya";
export { notifier as notify } from "@tenant-hub/adapters";

/** The first manager (or admin) of an organisation, to tell when something needs a person. */
export async function managerEmail(client: Queryable, orgId: string): Promise<string | null> {
  const r = await client.query<{ email: string | null }>(
    `SELECT email FROM profiles WHERE org_id = $1 AND role IN ('manager','admin') AND email IS NOT NULL
     ORDER BY CASE role WHEN 'manager' THEN 0 ELSE 1 END, created_at LIMIT 1`, [orgId]);
  return r.rows[0]?.email ?? null;
}

export const today = () => new Date().toISOString().slice(0, 10);
export const daysBetween = (a: string | Date, b = new Date()) => Math.floor((b.getTime() - new Date(a).getTime()) / 864e5);
