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
