import { db } from "@tenant-hub/db";
import type { Actor } from "./api-auth";

/**
 * Who may add, approve, re-role or remove people in an organisation
 * (Matloob, 2026-10-14: "I'm the admin, I'm the only user that can add other
 * users — my employees sign in as themselves so a mistake has a name on it").
 *
 * Rule: the organisation's `admin` accounts. Bootstrap: while an organisation
 * has NO admin yet (a brand-new customer whose first person arrived as a
 * manager), its managers may — otherwise nobody could ever create the first
 * admin. The moment one admin exists, managers lose it.
 */
export async function canManageUsers(actor: Actor): Promise<boolean> {
  if (actor.user_role === "admin") return true;
  if (actor.user_role !== "manager" || !actor.org_id) return false;
  const r = await db().query<{ n: string }>("SELECT count(*) AS n FROM profiles WHERE org_id = $1 AND role = 'admin'", [actor.org_id]);
  return Number(r.rows[0]?.n ?? 0) === 0;
}

export const USER_ROLES = ["admin", "manager", "support_worker", "contractor", "tenant"] as const;
