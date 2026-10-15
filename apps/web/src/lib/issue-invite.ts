/**
 * Issuing an account (Matloob, 2026-10-15): the admin creates it with a
 * system-generated password, hands over the sign-in link AND the password,
 * and keeps a copy in the vault. The person cannot change that password —
 * only the admin can issue a new one. Used by "Invite someone" and by
 * approving an access request — one path, so the two never drift (H7).
 *
 * The email is still attempted; the link + password come back to the admin
 * regardless, because email has not been reliable here.
 */
import { db, writeWithAudit, createProfileWithPassword, supersedeCredentials, findProfileByEmail, deleteAllSessionsForProfile, setPasswordHash } from "@tenant-hub/db";
import { hashPassword } from "@tenant-hub/auth";
import { notifier } from "@tenant-hub/adapters";
import { env } from "@tenant-hub/env";
import { generatePassword, seal, vaultOpen } from "./vault";

type Actor = Omit<Parameters<typeof writeWithAudit>[0], "table" | "record" | "action" | "entry_method">;

export interface Issued { delivered: boolean; url: string; password: string; profileId: string; vaulted: boolean }

async function vault(i: { orgId: string; profileId: string; email: string; password: string; actor: Actor }): Promise<boolean> {
  if (!vaultOpen()) return false;
  await supersedeCredentials(db(), i.profileId);
  const sealed = seal(i.password);
  await writeWithAudit({ table: "issued_credentials", record: { org_id: i.orgId, profile_id: i.profileId, email: i.email.toLowerCase(), ...sealed, issued_by: i.actor.user_id, issued_by_name: i.actor.user_name } as Record<string, unknown>, action: "CREATE", ...i.actor, org_id: i.orgId });
  return true;
}

/** New account: created now, password generated, vaulted, emailed. */
export async function issueInvite(i: { email: string; role: string; orgId: string; brand: string; invitedBy: string; fullName?: string | null; tenantId?: string | null; origin: string; actor: Actor }): Promise<Issued> {
  const email = i.email.trim().toLowerCase();
  const password = generatePassword();
  const existing = await findProfileByEmail(db(), email);
  if (existing) throw new Error(`${existing.full_name} already has an account with ${email}`);
  const { id: profileId } = await createProfileWithPassword(db(), { email, fullName: i.fullName?.trim() || email.split("@")[0]!, role: i.role, orgId: i.orgId, brand: i.brand, tenantId: i.tenantId ?? null, passwordHash: await hashPassword(password) });
  // The account's own birth is on the audit trail.
  await writeWithAudit({ table: "profiles", record: { id: profileId, role: i.role } as Record<string, unknown>, action: "UPDATE", ...i.actor, org_id: i.orgId }).catch(() => {});
  const vaulted = await vault({ orgId: i.orgId, profileId, email, password, actor: i.actor });
  const base = env.server.APP_URL ?? i.origin;
  const url = `${base}/login?email=${encodeURIComponent(email)}`;
  const delivered = await send(email, i.role, url, password);
  return { delivered, url, password, profileId, vaulted };
}

/** A fresh password for an existing person: old one stops working everywhere, new one vaulted and emailed. */
export async function reissuePassword(i: { profileId: string; email: string; role: string; orgId: string; origin: string; actor: Actor }): Promise<Issued> {
  const password = generatePassword();
  await setPasswordHash(db(), i.profileId, await hashPassword(password));
  await deleteAllSessionsForProfile(db(), i.profileId);
  const vaulted = await vault({ orgId: i.orgId, profileId: i.profileId, email: i.email, password, actor: i.actor });
  const base = env.server.APP_URL ?? i.origin;
  const url = `${base}/login?email=${encodeURIComponent(i.email)}`;
  const delivered = await send(i.email, i.role, url, password);
  return { delivered, url, password, profileId: i.profileId, vaulted };
}

async function send(to: string, role: string, url: string, password: string): Promise<boolean> {
  try {
    const res = await notifier().send({
      to, channel: "email", subject: "Your Tenant Hub account",
      body: `You have a Tenant Hub account as ${role.replace("_", " ")}.\n\nSign in here: ${url}\nPassword: ${password}\n\nKeep it safe — it can't be changed from inside the system. If you lose it, ask your admin for a new one.`,
    });
    return res.mode === "live" && res.data.delivered;
  } catch { return false; }
}
