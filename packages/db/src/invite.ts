import { adminClient } from "./client";

export async function inviteUser(email: string, role: string, orgId: string, fullName: string, brand: string) {
  // 1. Send invite email via Supabase Admin Auth
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email);
  if (error) throw new Error(error.message);

  // 2. Pre-create the profile with the correct org_id and role
  if (data.user) {
    await adminClient.from("profiles").insert({
      id: data.user.id,
      role: role as any,
      org_id: orgId,
      full_name: fullName,
      brand: brand,
    });
  }

  return data.user;
}

/**
 * Invite a tenant to the portal.
 * Sets role='tenant' and tenant_id in auth metadata so the DB trigger
 * (handle_new_user) auto-creates the profile with the correct link.
 */
export async function inviteTenant(
  email: string,
  tenantId: string,
  fullName: string,
  brand: string,
  orgId?: string,
) {
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      role: "tenant",
      tenant_id: tenantId,
    },
  });
  if (error) throw new Error(error.message);

  // Defensive: ensure the profile row exists (the trigger should handle this,
  // but upsert protects against edge-cases where the trigger hasn't run yet).
  if (data.user) {
    await adminClient.from("profiles").upsert(
      {
        id: data.user.id,
        role: "tenant" as any,
        full_name: fullName,
        brand: brand,
        org_id: orgId ?? null,
        tenant_id: tenantId,
      } as any,
      { onConflict: "id" },
    );
  }

  return data.user;
}
