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

/**
 * Who may onboard a BRAND-NEW Managing Agent (a new `organisations` row), as
 * distinct from adding people inside an existing one (Rume, 2026-10-26 — "if
 * Matlub can add managing agents from his seat, he can seed a competitor,
 * that's not RBAC"). Platform-level action; gated on an env allowlist of
 * emails. If unset, nobody can; the "Add a managing agent" card hides.
 *
 * `PLATFORM_OWNER_EMAILS` is a comma-separated list, lower-cased on compare.
 */
export function platformOwnerEmails(): string[] {
  return (process.env.PLATFORM_OWNER_EMAILS ?? "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isPlatformOwner(actor: { email?: string | null }): boolean {
  if (!actor.email) return false;
  const owners = platformOwnerEmails();
  if (owners.length === 0) return false;
  return owners.includes(actor.email.toLowerCase());
}

/**
 * Public /signup is open ONLY while the platform has no owner yet — the
 * bootstrap case for a brand-new deploy. Once PLATFORM_OWNER_EMAILS has any
 * value, every new Managing Agent is onboarded by the owner through the
 * Platform Console; the public form refuses to create accounts and tells the
 * visitor to contact them for an invite. `PLATFORM_SIGNUP_MODE=open` is the
 * override, if you ever want to re-open self-serve (not recommended with a
 * real customer live).
 */
export function isPublicSignupAllowed(): boolean {
  if ((process.env.PLATFORM_SIGNUP_MODE ?? "").toLowerCase() === "open") return true;
  return platformOwnerEmails().length === 0;
}
