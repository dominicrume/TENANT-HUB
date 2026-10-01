import { describe, it, expect } from "vitest";
import { can, PERMISSIONS, type Resource } from "./rbac";

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

  it("no role can read audit_logs except manager and admin", () => {
    expect(can("support_worker", "audit_logs", "read")).toBe(false);
    expect(can("tenant", "audit_logs", "read")).toBe(false);
    expect(can("contractor", "audit_logs", "read")).toBe(false);
    expect(can("manager", "audit_logs", "read")).toBe(true);
    expect(can("admin", "audit_logs", "read")).toBe(true);
  });
});

describe("contractor role (BUILD_PLAN C19)", () => {
  it("sees only maintenance, read-only, and nothing else", () => {
    expect(can("contractor", "maintenance", "read")).toBe(true);
    expect(can("contractor", "maintenance", "create")).toBe(false);
    expect(can("contractor", "maintenance", "update")).toBe(false);
    for (const resource of Object.keys(PERMISSIONS.contractor) as Resource[]) {
      if (resource === "maintenance") continue;
      expect(PERMISSIONS.contractor[resource], resource).toEqual([]);
    }
  });
});

describe("agents resource is read-only for every role (the runtime writes via the service connection, H2)", () => {
  it("no role can create, update or delete on agents", () => {
    for (const role of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      expect(can(role, "agents", "create"), role).toBe(false);
      expect(can(role, "agents", "update"), role).toBe(false);
      expect(can(role, "agents", "delete"), role).toBe(false);
    }
  });
});

describe("RBAC Parity with RLS", () => {
  /**
   * Resources introduced with the Estate Ops integration are logical groups
   * over several tables (e.g. "arrears" spans arrears_cases and
   * arrears_events). A resource satisfies an action if ANY of its mapped
   * tables carries a matching policy. Resources not listed here map to a
   * single table of the same name, as before.
   */
  const RESOURCE_TABLES: Partial<Record<Resource, string[]>> = {
    properties:   ["properties", "landlords", "property_documents"],
    tenancies:    ["tenancies"],
    rent:         ["service_charges", "rent_payments", "rent_unmatched"],
    arrears:      ["arrears_cases", "arrears_events"],
    compliance:   ["certificates", "compliance_alerts"],
    insurance:    ["insurance_policies", "insurance_renewal_cycles", "insurance_quotes"],
    regulation:   ["regulation_sources", "regulation_items", "regulation_impacts"],
    maintenance:  ["maintenance_tickets", "trades", "dispatch_jobs"],
    interactions: ["staff_notes", "communications"],
    agents:       ["jobs", "agent_health", "agent_telemetry"],
  };

  it("Every TypeScript permission MUST have a matching RLS policy", () => {
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

    // Policies accumulate across migrations — stamp_queue FOR UPDATE lands in
    // 027, not 017 — so parity has to be checked against the whole schema
    // history, not a single file.
    const migrationsDir = path.join(rootDir, "supabase/migrations");
    const sql = fs
      .readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith(".sql"))
      .map((f: string) => fs.readFileSync(path.join(migrationsDir, f), "utf-8"))
      .join("\n")
      .toLowerCase();

    // Mapping TS actions to SQL commands
    const actionToSql = {
      read: "select",
      create: "insert",
      update: "update",
      delete: "delete",
      export: "select",
    };

    const missing: string[] = [];

    for (const [role, resources] of Object.entries(PERMISSIONS)) {
      for (const [resource, actions] of Object.entries(resources)) {
        for (const action of actions) {
          const sqlCommand = actionToSql[action as keyof typeof actionToSql];

          // Tenant read is scoped by `id = auth.uid()` / the helper functions,
          // rather than a role check.
          if (role === "tenant" && resource === "tenants" && action === "read") continue;
          // export maps onto select, already covered by the read permission
          if (action === "export") continue;

          const tables = RESOURCE_TABLES[resource as Resource] ?? [resource];

          // `DROP POLICY x ON t` has no "for <cmd>" clause, so this only ever
          // matches a CREATE POLICY statement.
          const policyExists = tables.some(
            (table) =>
              sql.includes(`on ${table} for ${sqlCommand}`) ||
              sql.includes(`on public.${table} for ${sqlCommand}`) ||
              sql.includes(`on ${table} for all`) ||
              sql.includes(`on public.${table} for all`),
          );

          if (!policyExists) {
            missing.push(`${role} → ${resource}.${action} (expected an RLS policy FOR ${sqlCommand.toUpperCase()} on one of: ${tables.join(", ")})`);
          }
        }
      }
    }

    // Report every gap at once, named, instead of failing on the first bare boolean.
    expect(missing).toEqual([]);
  });
});
