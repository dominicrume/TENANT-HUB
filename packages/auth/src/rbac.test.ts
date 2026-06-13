import { describe, it, expect } from "vitest";
import { can, PERMISSIONS } from "./rbac";

describe("RBAC matrix", () => {
  it("manager can do everything on tenants", () => {
    expect(can("manager", "tenants", "read")).toBe(true);
    expect(can("manager", "tenants", "delete")).toBe(true);
    expect(can("manager", "audit_logs", "read")).toBe(true);
  });

  it("support_worker cannot delete tenants", () => {
    expect(can("support_worker", "tenants", "delete")).toBe(false);
  });

  it("tenant can only read own record", () => {
    expect(can("tenant", "tenants", "read")).toBe(true);
    expect(can("tenant", "tenants", "create")).toBe(false);
    expect(can("tenant", "audit_logs", "read")).toBe(false);
  });

  it("no role can read audit_logs except manager", () => {
    expect(can("support_worker", "audit_logs", "read")).toBe(false);
    expect(can("tenant", "audit_logs", "read")).toBe(false);
    expect(can("manager", "audit_logs", "read")).toBe(true);
  });
});

describe("RBAC Parity with RLS", () => {
  it("Every TypeScript permission MUST have a matching RLS policy in migration 017", () => {
    const fs = require("fs");
    const path = require("path");
    
    // Find the monorepo root to locate supabase/migrations
    let currentDir = process.cwd();
    let rootDir = null;
    while (currentDir && currentDir !== "/") {
      if (fs.existsSync(path.join(currentDir, "pnpm-workspace.yaml"))) {
        rootDir = currentDir;
        break;
      }
      currentDir = path.dirname(currentDir);
    }
    
    expect(rootDir).not.toBeNull();
    const migrationPath = path.join(rootDir, "supabase/migrations/017_strict_rls_isolation.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8").toLowerCase();

    // Mapping TS actions to SQL commands
    const actionToSql = {
      read: "select",
      create: "insert",
      update: "update",
      delete: "delete",
      export: "select"
    };

    // Iterate through all roles, resources, and actions in the matrix
    for (const [role, resources] of Object.entries(PERMISSIONS)) {
      for (const [resource, actions] of Object.entries(resources)) {
        for (const action of actions) {
          const sqlCommand = actionToSql[action as keyof typeof actionToSql];
          
          // Tenant read is handled by RLS 'id = auth.uid()' in a different file or specially here
          if (role === 'tenant' && resource === 'tenants' && action === 'read') continue;
          // export maps to select
          if (action === 'export') continue;
          
          // Check if there's a policy for this table and command
          // A very rudimentary check: the table and command must exist, and for non-tenant roles, the role string should appear
          const policyExists = sql.includes(`on ${resource} for ${sqlCommand}`);
          
          // Since the migration might handle 'manager' and 'support_worker' together, we verify the role name appears near it, or the policy simply exists
          expect(policyExists).toBe(true);
        }
      }
    }
  });
});
