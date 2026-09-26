#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SCOREBOARD_PATH = path.join(__dirname, '..', 'SCOREBOARD.md');

// This script reads SCOREBOARD.md. It verifies process discipline — that each
// KYA check is scored and any MISSING carries a signed waiver. It compiles
// nothing and runs no tests, so on its own it CANNOT say whether the tree is
// shippable. Between 2 and 7 Aug 2026 it printed "Safe to ship" on every run
// while turbo failed to parse turbo.json and lint/typecheck/test/build never
// executed at all.
//
// Only `pnpm verify` — which runs lint, typecheck, test and build first — may
// pass --ship and print a shipping verdict.
const SHIP_VERDICT = process.argv.includes('--ship');

// ── Source gates (docs/BUILD_PLAN.md C11): fail on forbidden imports anywhere in apps/ and packages/.
const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', '.next', 'dist', '.turbo', '.git']);
function walk(dir, out) {
  for (const f of fs.readdirSync(dir)) {
    if (SKIP.has(f)) continue;
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(full)) out.push(full);
  }
  return out;
}
const GATES = [
  { name: 'no @estate-ops imports (reference source only)', re: /(from\s+|import\s*\(\s*|require\(\s*)["']@estate-ops\//, where: () => true },
  { name: 'pg imported only inside packages/db', re: /from\s+["']pg["']|require\(\s*["']pg["']\s*\)/, where: (f) => !f.includes(`${path.sep}packages${path.sep}db${path.sep}`) },
];
let gateFailed = false;
const files = [];
for (const d of ['apps', 'packages']) { const p = path.join(ROOT, d); if (fs.existsSync(p)) walk(p, files); }
for (const g of GATES) {
  const hits = files.filter((f) => g.where(f) && g.re.test(fs.readFileSync(f, 'utf8')));
  if (hits.length) { gateFailed = true; console.error(`\x1b[31m[BLOCKED]\x1b[0m ${g.name}:\n  ${hits.map((h) => path.relative(ROOT, h)).join('\n  ')}`); }
  else console.log(`\x1b[32m[GATE OK]\x1b[0m ${g.name}`);
}
if (gateFailed) { console.error('\n\x1b[31m[FAILED]\x1b[0m Source gates blocked shipment.'); process.exit(1); }

try {
  const content = fs.readFileSync(SCOREBOARD_PATH, 'utf8');
  const lines = content.split('\n');
  
  let failed = false;

  console.log('Running KYA Inspection Gate...');

  lines.forEach((line) => {
    // Look for lines that look like list items for the 13 checks
    if (/^\d+\.\s+\*\*/.test(line)) {
      if (line.includes('MISSING')) {
        // Check if there is a signed reason. A signed reason is assumed if the line is long enough after the MISSING keyword, 
        // but for a strict gate, we want no MISSING unless explicitly waived. 
        // We will enforce that any MISSING must have a signed note e.g. "MISSING (signed: Rume, 2026-08-01)"
        const match = line.match(/MISSING\s*\(([^)]+)\)/);
        if (!match) {
          console.error(`\x1b[31m[BLOCKED]\x1b[0m Check failed without a signed waiver: ${line}`);
          failed = true;
        } else {
          console.log(`\x1b[33m[WAIVED]\x1b[0m ${line}`);
        }
      } else if (line.includes('GROWING')) {
        console.log(`\x1b[33m[GROWING]\x1b[0m ${line}`);
      } else if (line.includes('PASS')) {
        console.log(`\x1b[32m[PASS]\x1b[0m ${line}`);
      } else {
        console.error(`\x1b[31m[BLOCKED]\x1b[0m Unscored check: ${line}`);
        failed = true;
      }
    }
  });

  if (failed) {
    console.error('\n\x1b[31m[FAILED]\x1b[0m KYA gate blocked shipment. Fix the MISSING scores or sign a waiver.');
    process.exit(1);
  } else if (SHIP_VERDICT) {
    console.log('\n\x1b[32m[SUCCESS]\x1b[0m KYA scoreboard clean AND lint + typecheck + test + build all passed. Safe to ship.');
    process.exit(0);
  } else {
    console.log('\n\x1b[32m[SCOREBOARD OK]\x1b[0m All 13 KYA checks scored or waived.');
    console.log('\x1b[33m[NOT A SHIP VERDICT]\x1b[0m No code was compiled or tested. Run `pnpm verify` before shipping.');
    process.exit(0);
  }
} catch (e) {
  console.error('\x1b[31m[ERROR]\x1b[0m SCOREBOARD.md not found or unreadable. Cannot pass KYA gate.');
  process.exit(1);
}
