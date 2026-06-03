/**
 * SecureDbGateway — the ONLY DB interface the AI package may use.
 * Injected at runtime from apps/web (never constructed inside ai package).
 * Always uses the RLS-respecting client — never service-role.
 * Causes writes ONLY via the human-approval queue.
 *
 * H2 enforcement: ai package imports this interface, NOT @supabase/supabase-js.
 */
import type { CanonicalTenant } from "@tenant-hub/validation";

export interface SecureDbGateway {
  /** Read tenants visible to the current user (RLS enforced) */
  readTenants(): Promise<CanonicalTenant[]>;

  /** Read sessions for a specific tenant */
  readSessions(tenantId: string): Promise<Array<{
    id: string;
    session_type: string;
    session_date: string;
    notes: string;
  }>>;

  /** Enqueue a proposed change for human approval — NEVER writes directly */
  enqueueProposal(proposal: {
    tenant_id:   string;
    proposed_by: "ai";
    changes:     Partial<CanonicalTenant>;
    reason:      string;
  }): Promise<void>;
}
