/**
 * RBAC Permission Matrix — TypeScript source of truth.
 * MUST be kept in parity with RLS policies in supabase/migrations/.
 * CI test: every TS permission has a matching RLS policy, and vice versa.
 *
 * Resources introduced with the Estate Ops integration (docs/BUILD_PLAN.md
 * C19) are logical groups over several tables, not single-table names:
 * see RESOURCE_TABLES in rbac.test.ts for the mapping the parity check uses.
 * `agents` is read-only for everyone — the runtime writes through the
 * service role / worker connection, which bypasses RLS entirely (H2).
 */
import type { UserRoleSchema } from "@tenant-hub/validation";
import { z } from "zod";

export type UserRole = z.infer<typeof UserRoleSchema>;

export type Resource =
  | "tenants" | "sessions" | "service_charges" | "audit_logs"
  | "intake_checklists" | "drafts" | "stamp_queue"
  | "properties" | "tenancies" | "rent" | "arrears" | "compliance"
  | "insurance" | "regulation" | "maintenance" | "interactions" | "agents";

export type Action = "read" | "create" | "update" | "delete" | "export";

type PermissionMatrix = Record<UserRole, Record<Resource, Action[]>>;

export const PERMISSIONS: PermissionMatrix = {
  admin: {
    tenants:           ["read","create","update","delete","export"],
    sessions:          ["read","create","update","delete"],
    service_charges:   ["read","create","update","delete"],
    audit_logs:        ["read","export"],
    intake_checklists: ["read","create","update"],
    drafts:            ["read","create","update","delete"],
    stamp_queue:       ["read","update"],
    properties:        ["read","create","update","delete"],
    tenancies:         ["read","create","update","delete"],
    rent:              ["read","create","update","delete"],
    arrears:           ["read","create","update","delete"],
    compliance:        ["read","create","update","delete"],
    insurance:         ["read","create","update","delete"],
    regulation:        ["read","create","update","delete"],
    maintenance:       ["read","create","update","delete"],
    interactions:      ["read","create","update","delete"],
    agents:            ["read"],
  },
  manager: {
    tenants:           ["read","create","update","delete","export"],
    sessions:          ["read","create","update","delete"],
    service_charges:   ["read","create","update","delete"],
    audit_logs:        ["read","export"],
    intake_checklists: ["read","create","update"],
    drafts:            ["read","create","update","delete"],
    stamp_queue:       ["read","update"],
    properties:        ["read","create","update","delete"],
    tenancies:         ["read","create","update","delete"],
    rent:              ["read","create","update","delete"],
    arrears:           ["read","create","update","delete"],
    compliance:        ["read","create","update","delete"],
    insurance:         ["read","create","update","delete"],
    regulation:        ["read","create","update","delete"],
    maintenance:       ["read","create","update","delete"],
    interactions:      ["read","create","update","delete"],
    agents:            ["read"],
  },
  support_worker: {
    tenants:           ["read","create","update"],
    sessions:          ["read","create","update"],
    service_charges:   ["read"],
    audit_logs:        [],
    intake_checklists: ["read","create","update"],
    drafts:            ["read","create","update"],
    stamp_queue:       [],
    properties:        ["read"],
    tenancies:         ["read","create","update"],
    rent:              ["read","create","update"],
    arrears:           ["read","create","update"],
    compliance:        ["read","create","update"],
    insurance:         ["read"],
    regulation:        ["read"],
    maintenance:       ["read","create","update"],
    interactions:      ["read","create","update"],
    agents:            ["read"],
  },
  tenant: {
    tenants:           ["read"],     // own record only (RLS enforced)
    sessions:          [],
    service_charges:   [],
    audit_logs:        [],
    intake_checklists: ["read"],
    drafts:            ["read"],
    stamp_queue:       [],
    properties:        ["read"],     // the home they live in (RLS enforced)
    tenancies:         ["read"],     // their own tenancy only
    rent:              ["read"],     // their own charges and payments
    arrears:           [],
    compliance:        ["read"],     // certificates for their own home
    insurance:         [],
    regulation:        [],
    maintenance:       ["read","create"], // report a problem, see its status
    interactions:      [],
    agents:            [],
  },
  contractor: {
    tenants:           [],
    sessions:          [],
    service_charges:   [],
    audit_logs:        [],
    intake_checklists: [],
    drafts:            [],
    stamp_queue:       [],
    properties:        [],
    tenancies:         [],
    rent:              [],
    arrears:           [],
    compliance:        [],
    insurance:         [],
    regulation:        [],
    maintenance:       ["read"],     // the jobs dispatched to their trade only (RLS enforced)
    interactions:      [],
    agents:            [],
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
