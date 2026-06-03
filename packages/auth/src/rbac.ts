/**
 * RBAC Permission Matrix — TypeScript source of truth.
 * MUST be kept in parity with RLS policies in supabase/migrations/.
 * CI test: every TS permission has a matching RLS policy, and vice versa.
 */
import type { UserRoleSchema } from "@tenant-hub/validation";
import { z } from "zod";

export type UserRole = z.infer<typeof UserRoleSchema>;

export type Resource =
  | "tenants" | "sessions" | "service_charges" | "audit_logs"
  | "intake_checklists" | "drafts" | "stamp_queue";

export type Action = "read" | "create" | "update" | "delete" | "export";

type PermissionMatrix = Record<UserRole, Record<Resource, Action[]>>;

export const PERMISSIONS: PermissionMatrix = {
  manager: {
    tenants:           ["read","create","update","delete","export"],
    sessions:          ["read","create","update","delete"],
    service_charges:   ["read","create","update","delete"],
    audit_logs:        ["read","export"],
    intake_checklists: ["read","create","update"],
    drafts:            ["read","create","update","delete"],
    stamp_queue:       ["read"],
  },
  support_worker: {
    tenants:           ["read","create","update"],
    sessions:          ["read","create","update"],
    service_charges:   ["read"],
    audit_logs:        [],
    intake_checklists: ["read","create","update"],
    drafts:            ["read","create","update"],
    stamp_queue:       [],
  },
  tenant: {
    tenants:           ["read"],     // own record only (RLS enforced)
    sessions:          [],
    service_charges:   [],
    audit_logs:        [],
    intake_checklists: ["read"],
    drafts:            ["read"],
    stamp_queue:       [],
  },
};

export function can(role: UserRole, resource: Resource, action: Action): boolean {
  return (PERMISSIONS[role]?.[resource] ?? []).includes(action);
}

export function requirePermission(
  role: UserRole, resource: Resource, action: Action
): void {
  if (!can(role, resource, action)) {
    throw new Error(`Permission denied: ${role} cannot ${action} on ${resource}`);
  }
}
