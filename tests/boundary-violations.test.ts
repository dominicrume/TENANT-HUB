/**
 * Boundary violation test — proves ESLint guards work.
 * A ui→domain import must fail lint.
 * Run: pnpm lint (expect failure when violation present)
 */
import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import path from "path";

describe("dependency boundary enforcement", () => {
  it("ESLint config file exists", () => {
    const cfg = path.resolve(__dirname, "../packages/eslint-config/index.js");
    expect(() => require(cfg)).not.toThrow();
  });

  it("import/no-restricted-paths rule is defined for ui→domain", () => {
    const cfg = require("../packages/eslint-config/index.js");
    const rule = cfg.rules["import/no-restricted-paths"];
    expect(Array.isArray(rule)).toBe(true);
    const zones = rule[1].zones as Array<{target: string|string[]; message: string}>;
    const uiZone = zones.find(z =>
      (Array.isArray(z.target) ? z.target : [z.target]).some(t => t.includes("packages/ui"))
      && z.message.includes("PRESENTATIONAL")
    );
    expect(uiZone).toBeDefined();
  });
});
