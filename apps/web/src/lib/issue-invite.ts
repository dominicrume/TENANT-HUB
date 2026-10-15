import { db, createInvite, attachInviteToken } from "@tenant-hub/db";
import { generateToken, hashToken } from "@tenant-hub/auth";
import { notifier } from "@tenant-hub/adapters";
import { env } from "@tenant-hub/env";

/**
 * Issues an own-session invite: the invite row, a one-time token (stored
 * hashed), and the email with the link. Used by a manager's direct invite
 * (/api/auth/invite) and by approving an access request — one path, so the
 * two can never drift (H7).
 */
export async function issueInvite(i: { email: string; role: string; orgId: string; brand: string; invitedBy: string; fullName?: string | null; tenantId?: string | null; origin: string }): Promise<{ delivered: boolean; url: string }> {
  const client = db();
  await createInvite(client, {
    email: i.email, role: i.role, orgId: i.orgId, brand: i.brand, invitedBy: i.invitedBy,
    fullName: i.fullName || i.email.split("@")[0], tenantId: i.tenantId ?? null,
  });
  const token = generateToken();
  await attachInviteToken(client, { email: i.email, tokenHash: hashToken(token) });
  const base = env.server.APP_URL ?? i.origin;
  const url = `${base}/invite/${token}`;
  // The link is also handed back to the admin who issued it, so the account can be
  // created even when email is down (2026-10-15: the sending domain wasn't verified
  // and nobody could join) — they paste it into WhatsApp instead.
  try {
    const res = await notifier().send({
      to: i.email, channel: "email", subject: "You've been invited to Tenant Hub",
      body: `You've been invited to join as ${i.role.replace("_", " ")}.\n\nSet your password here (the link works once, for 14 days):\n\n${url}`,
    });
    // Simulated notifier (practice mode) reports delivered but nothing left the building — say so honestly.
    return { delivered: res.mode === "live" && res.data.delivered, url };
  } catch {
    return { delivered: false, url };
  }
}
