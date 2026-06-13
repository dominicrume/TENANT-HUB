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
});
