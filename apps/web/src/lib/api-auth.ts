/**
 * API auth helper — resolves the authenticated actor for route handlers.
 * Returns the RLS-respecting server client (for reads) plus the actor context
 * that writeWithAudit needs. Routes treat a null return as 401 (never silent).
 */
import { createSupabaseServer } from "./supabase-server";
import type { UserRole } from "@tenant-hub/auth";

export interface Actor {
  user_id: string;
  user_name: string;
  user_role: UserRole;
  brand: string;
  org_id?: string;
}

export interface ApiAuth {
  supabase: ReturnType<typeof createSupabaseServer>;
  actor: Actor;
}

export async function getApiAuth(): Promise<ApiAuth | null> {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, brand, org_id")
    .eq("id", user.id)
    .single();

  return {
    supabase,
    actor: {
      user_id: user.id,
      user_name: (profile?.full_name as string | undefined) ?? user.email ?? user.id,
      user_role: (profile?.role as UserRole | undefined) ?? "tenant",
      brand: (profile?.brand as string | undefined) ?? "mattys_place",
      org_id: profile?.org_id as string | undefined,
    },
  };
}

/** Best-effort previous audit hash for a record, to chain the audit log. */
export async function latestAuditHash(
  supabase: ReturnType<typeof createSupabaseServer>,
  recordId: string,
): Promise<string | undefined> {
  const { data } = await supabase
    .from("audit_logs")
    .select("blockchain_hash")
    .eq("record_id", recordId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.blockchain_hash as string | undefined) ?? undefined;
}
