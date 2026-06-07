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
    
    // We already removed the breach in check_draft.ts and force_create.ts. 
    // This test ensures it doesn't happen again.
    const hasBreach = searchRecursive(path.resolve(__dirname, "../../../apps/web/src"));
    expect(hasBreach).toBe(false);
  });
});
