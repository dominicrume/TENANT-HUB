#!/usr/bin/env node
/**
 * pnpm gen — scaffolds a new package under packages/
 * Usage: pnpm gen my-package-name
 */
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const name = process.argv[2];
if (!name) { console.error("Usage: pnpm gen <package-name>"); process.exit(1); }

const dir = resolve(process.cwd(), "packages", name);
if (existsSync(dir)) { console.error(`packages/${name} already exists.`); process.exit(1); }

mkdirSync(join(dir, "src"), { recursive: true });

writeFileSync(join(dir, "package.json"), JSON.stringify({
  name: `@tenant-hub/${name}`,
  version: "0.0.1",
  private: true,
  main: "./src/index.ts",
  exports: { ".": "./src/index.ts" },
  scripts: { typecheck: "tsc --noEmit", test: "vitest run", lint: "eslint src" },
  dependencies: {},
  devDependencies: { typescript: "5.4.5", vitest: "1.6.0" }
}, null, 2));

writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
  extends: "../../tsconfig.base.json",
  include: ["src"]
}, null, 2));

writeFileSync(join(dir, "src/index.ts"), `// @tenant-hub/${name}\n`);

console.log(`✅ Created packages/${name}`);
console.log(`   Add "@tenant-hub/${name}": "workspace:*" to dependents.`);
