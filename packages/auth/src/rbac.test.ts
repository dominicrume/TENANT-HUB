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

          // Tenant read is scoped by `id = auth.uid()` rather than a role check.
          if (role === "tenant" && resource === "tenants" && action === "read") continue;
          // export maps onto select, already covered by the read permission
          if (action === "export") continue;

          // `DROP POLICY x ON t` has no "for <cmd>" clause, so this only ever
          // matches a CREATE POLICY statement.
          const policyExists =
            sql.includes(`on ${resource} for ${sqlCommand}`) ||
            sql.includes(`on public.${resource} for ${sqlCommand}`) ||
            sql.includes(`on ${resource} for all`) ||
            sql.includes(`on public.${resource} for all`);

          if (!policyExists) {
            missing.push(`${role} → ${resource}.${action} (expected an RLS policy FOR ${sqlCommand.toUpperCase()})`);
          }
        }
      }
    }

    // Report every gap at once, named, instead of failing on the first bare boolean.
    expect(missing).toEqual([]);
  });
});
