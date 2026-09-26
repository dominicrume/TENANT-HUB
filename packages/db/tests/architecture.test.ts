import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Hardening Architecture Enforcement", () => {
  it("H2: service-role key is never imported outside packages/db", () => {
    // A primitive static analysis check to ensure the boundary isn't breached.
    const searchRecursive = (dir: string): boolean => {
      let breached = false;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file === "node_modules" || file === ".next" || file === ".git" || file === "dist") continue;
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          breached = breached || searchRecursive(fullPath);
        } else if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
          // If the file is NOT in packages/db, it shouldn't import the admin client or use the service key
          if (!fullPath.includes("packages/db")) {
            const content = fs.readFileSync(fullPath, "utf-8");
            if (content.includes("SUPABASE_SERVICE_ROLE_KEY") || content.includes("adminClient")) {
              console.error(`Boundary breach found in: ${fullPath}`);
              breached = true;
            }
          }
        }
      }
      return breached;
    };
    
    // Walk up to find the monorepo root
    let rootDir = path.resolve(__dirname);
    while (rootDir && rootDir !== "/" && !fs.existsSync(path.join(rootDir, "pnpm-workspace.yaml"))) {
      const parent = path.dirname(rootDir);
      if (parent === rootDir) break;
      rootDir = parent;
    }
    let appsWebSrc = path.join(rootDir, "apps/web/src");

    // Fallback if rootDir was not correctly identified (e.g. in bundled test runs)
    if (!fs.existsSync(appsWebSrc)) {
      let currentDir = process.cwd();
      while (currentDir && currentDir !== "/") {
        const candidate = path.join(currentDir, "apps/web/src");
        if (fs.existsSync(candidate)) {
          appsWebSrc = candidate;
          break;
        }
        const parent = path.dirname(currentDir);
        if (parent === currentDir) break;
        currentDir = parent;
      }
    }
    
    // This test ensures no administrative role keys are imported outside of packages/db.
    const hasBreach = searchRecursive(appsWebSrc);
    expect(hasBreach).toBe(false);
  });

  it("H1: write_with_audit is the ONLY write path for core tables", () => {
    const coreTables = ["tenants", "sessions", "service_charges", "drafts"];
    const searchRecursive = (dir: string): boolean => {
      let breached = false;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file === "node_modules" || file === ".next" || file === ".git" || file === "dist") continue;
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          breached = breached || searchRecursive(fullPath);
        } else if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
          const content = fs.readFileSync(fullPath, "utf-8");
          for (const table of coreTables) {
            const patternInsert = new RegExp(`from\\(\\s*["']${table}["']\\s*\\)\\s*\\.\\s*insert`);
            const patternUpdate = new RegExp(`from\\(\\s*["']${table}["']\\s*\\)\\s*\\.\\s*update`);
            if (patternInsert.test(content) || patternUpdate.test(content)) {
              console.error(`Direct insert/update found for table ${table} in: ${fullPath}`);
              breached = true;
            }
          }
        }
      }
      return breached;
    };
    
    let rootDir = path.resolve(__dirname);
    while (rootDir && rootDir !== "/" && !fs.existsSync(path.join(rootDir, "pnpm-workspace.yaml"))) {
      const parent = path.dirname(rootDir);
      if (parent === rootDir) break;
      rootDir = parent;
    }
    let appsWebSrc = path.join(rootDir, "apps/web/src");
    if (!fs.existsSync(appsWebSrc)) {
      let currentDir = process.cwd();
      while (currentDir && currentDir !== "/") {
        const candidate = path.join(currentDir, "apps/web/src");
        if (fs.existsSync(candidate)) {
          appsWebSrc = candidate;
          break;
        }
        const parent = path.dirname(currentDir);
        if (parent === currentDir) break;
        currentDir = parent;
      }
    }
    
    const hasBreach = searchRecursive(appsWebSrc);
    expect(hasBreach).toBe(false);
  });

  it("CON-1: `pg` is imported only inside packages/db", () => {
    let rootDir = path.resolve(__dirname);
    while (rootDir !== "/" && !fs.existsSync(path.join(rootDir, "pnpm-workspace.yaml"))) rootDir = path.dirname(rootDir);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const f of fs.readdirSync(dir)) {
        if (["node_modules", ".next", ".git", "dist", ".turbo"].includes(f)) continue;
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(full) && !full.includes(`${path.sep}packages${path.sep}db${path.sep}`)) {
          if (/from\s+["']pg["']|require\(\s*["']pg["']\s*\)/.test(fs.readFileSync(full, "utf-8"))) offenders.push(full);
        }
      }
    };
    for (const d of ["apps", "packages"]) { const p = path.join(rootDir, d); if (fs.existsSync(p)) walk(p); }
    expect(offenders).toEqual([]);
  });

  it("H1 ratchet: no NEW direct table writes outside writeWithAudit (legacy set shrinks at C09, never grows)", () => {
    // Every direct .insert/.update/.upsert/.delete on a table through the Supabase client, as of C10.
    // Each one is an H1 gap fixed when its route moves onto a repository (docs/BUILD_PLAN.md C09).
    // Remove entries here as they are fixed. Adding one is a build failure.
    const LEGACY = new Set([
      "communications insert", "communications_log insert", "form_templates upsert", "incident_reports insert",
      "intake_checklists update", "maintenance_tickets insert", "maintenance_tickets update", "organisations insert",
      "profiles update", "service_charges delete", "shift_handovers insert", "staff_notes insert", "stamp_queue update",
      "tenant_documents delete", "tenant_documents insert", "tenant_forms upsert", "tenant_goal_updates insert", "tenant_goals insert",
    ]);
    let rootDir = path.resolve(__dirname);
    while (rootDir !== "/" && !fs.existsSync(path.join(rootDir, "pnpm-workspace.yaml"))) rootDir = path.dirname(rootDir);
    const found = new Map<string, string[]>();
    const walk = (dir: string) => {
      for (const f of fs.readdirSync(dir)) {
        if ([".next", "node_modules", "dist"].includes(f)) continue;
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx)$/.test(full)) continue;
        const src = fs.readFileSync(full, "utf-8");
        const re = /\.from\(\s*["']([a-z_]+)["']\s*\)[\s\S]{0,200}?\.(insert|update|upsert|delete)\(/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) { const k = `${m[1]} ${m[2]}`; found.set(k, [...(found.get(k) ?? []), path.relative(rootDir, full)]); }
      }
    };
    walk(path.join(rootDir, "apps/web/src"));
    const added = [...found.keys()].filter((k) => !LEGACY.has(k));
    expect(added, `New direct writes bypass writeWithAudit: ${added.map((k) => `${k} in ${found.get(k)!.join(", ")}`).join("; ")}`).toEqual([]);
    const fixed = [...LEGACY].filter((k) => !found.has(k));
    if (fixed.length) console.log(`H1 ratchet: ${fixed.length} legacy direct writes fixed — remove from LEGACY: ${fixed.join(", ")}`);
  });
});
