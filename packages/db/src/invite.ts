import { adminClient } from "./client";

/**
 * Invites are pre-provisioned identity. Migration 029's handle_new_user()
 * trigger reads public.pending_invites to decide what role and organisation a
 * new auth user gets; anything not pre-provisioned (and not matching an active
 * tenants.email) is rejected outright.
 *
 * ORDER MATTERS: the invite row MUST exist before inviteUserByEmail() creates
 * the auth user, because the trigger fires on that INSERT. Creating it
 * afterwards is too late and the signup will be rejected.
 *
 * Do NOT switch this back to auth.users.invited_at — GoTrue sets that in a
 * separate UPDATE after the row is inserted, so it is always NULL inside the
 * AFTER INSERT trigger. See the header of migration 029.
 */
interface PendingInvite {
  email: string;
  role: string;
  orgId?: string | null;
  tenantId?: string | null;
  fullName?: string | null;
  brand?: string | null;
}

/**
 * Pre-provision an invite. Replaces any outstanding invite for the same email
 * (a live-invite-per-email unique index enforces this at the DB level too).
 */
async function createPendingInvite(invite: PendingInvite): Promise<void> {
  const email = invite.email.trim().toLowerCase();

  // Clear any outstanding invite so re-inviting someone always works.
  const { error: clearErr } = await adminClient
    .from("pending_invites")
    .delete()
    .eq("email", email)
    .is("consumed_at", null);
  if (clearErr) throw new Error(`Could not clear prior invite: ${clearErr.message}`);

  const { error } = await adminClient.from("pending_invites").insert({
    email,
    role: invite.role,
    org_id: invite.orgId ?? null,
    tenant_id: invite.tenantId ?? null,
    full_name: invite.fullName ?? null,
    brand: invite.brand ?? "mattys_place",
  } as any);
  if (error) throw new Error(`Could not pre-provision invite: ${error.message}`);
}

/** Roll the invite back if the auth-side invite failed, so it can't be reused. */
async function discardPendingInvite(email: string): Promise<void> {
  await adminClient
    .from("pending_invites")
    .delete()
    .eq("email", email.trim().toLowerCase())
    .is("consumed_at", null);
}

export async function inviteUser(
  email: string,
  role: string,
  orgId: string,
  fullName: string,
  brand: string,
) {
  await createPendingInvite({ email, role, orgId, fullName, brand });

  // The trigger creates the profile from the invite — do not insert it here.
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email);
  if (error) {
    await discardPendingInvite(email);
    throw new Error(error.message);
  }

  return data.user;
}

/**
 * Invite a tenant to the portal. The invite row carries tenant_id, so the
 * trigger links the profile to the tenant record and inherits its org.
 */
export async function inviteTenant(
  email: string,
  tenantId: string,
  fullName: string,
  brand: string,
  orgId?: string,
) {
  await createPendingInvite({ email, role: "tenant", tenantId, fullName, brand, orgId });

  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
  });
  if (error) {
    await discardPendingInvite(email);
    throw new Error(error.message);
  }

  return data.user;
}

/** Invite a staff member. orgId is required — staff are never org-less. */
export async function inviteStaffMember(
  email: string,
  role: string,
  orgId: string | undefined,
  brand: string | undefined,
  redirectTo?: string,
) {
  if (!orgId) {
    throw new Error("Cannot invite staff without an organisation.");
  }

  await createPendingInvite({ email, role, orgId, brand });

  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });
  if (error) {
    await discardPendingInvite(email);
    throw error;
  }

  return data.user;
}
