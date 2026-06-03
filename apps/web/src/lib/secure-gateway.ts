/**
 * Server-side SecureDbGateway implementation injected into packages/ai.
 * Built from the RLS-respecting server client (H2: the AI never sees the
 * service-role key and can only read what the current user can read).
 */
import type { SecureDbGateway } from "@tenant-hub/ai";
import type { CanonicalTenant } from "@tenant-hub/validation";
import { createSupabaseServer } from "./supabase-server";

export function makeSecureGateway(): SecureDbGateway {
  const supabase = createSupabaseServer();

  return {
    async readTenants() {
      const { data } = await supabase
        .from("tenants")
        .select("*")
        .eq("is_active", true)
        .eq("is_archived", false);
      return (data ?? []) as CanonicalTenant[];
    },

    async readSessions(tenantId: string) {
      const { data } = await supabase
        .from("sessions")
        .select("id, session_type, session_date, notes")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Array<{
        id: string;
        session_type: string;
        session_date: string;
        notes: string;
      }>;
    },

    async enqueueProposal(proposal) {
      // AI may only PROPOSE — never write directly (H2). There is no proposals
      // table in the current schema, so we log the intent. A future migration
      // can persist this to an ai_proposals review queue.
      console.info("[ai-proposal]", JSON.stringify(proposal));
    },
  };
}
