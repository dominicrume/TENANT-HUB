#!/usr/bin/env node
/**
 * One-off: delete a Managing Agent (organisation) and all its data —
 * profiles, tenants, landlords, everything org-scoped — so both the
 * organisation name and the admin's email become free to reuse on /signup.
 *
 * Why this script exists: `psql` isn't installed on Rume's Mac and
 * compiling libpq on Intel takes forever (brew Tier 3). This uses the
 * `pg` package already in packages/db — nothing to install.
 *
 * Usage, from the repo root. The Postgres service exposes BOTH an internal
 * URL (postgres.railway.internal, only resolves inside Railway) and a public
 * URL via the TCP proxy — the script picks the public one so this runs from
 * your laptop:
 *
 *   railway run --service Postgres -- \
 *     pnpm --filter=@tenant-hub/db exec node scripts/wipe-managing-agent.mjs "Matty's Place"
 *
 * It PRINTS what it will delete, then prompts you to type DELETE before
 * touching anything.
 */
import pg from "pg";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const name = process.argv[2];
if (!name) {
  console.error('Usage: node scripts/wipe-managing-agent.mjs "<Managing Agent name>"');
  process.exit(1);
}

// Prefer the public URL: an internal .railway.internal host won't resolve from your laptop.
const url = process.env.DATABASE_PUBLIC_URL
  || (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes(".railway.internal") ? process.env.DATABASE_URL : null);
if (!url) {
  console.error(
    "No reachable Postgres URL in env.\n" +
    "Run with `railway run --service Postgres --` so DATABASE_PUBLIC_URL is injected.\n" +
    "If you ran with --service web, you got the internal hostname (postgres.railway.internal) which only resolves inside a Railway container."
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const found = await client.query("SELECT id, name FROM organisations WHERE name = $1", [name]);
  if (found.rows.length === 0) {
    console.log(`No managing agent named "${name}" on the platform. Nothing to do.`);
    process.exit(0);
  }
  if (found.rows.length > 1) {
    console.error(`Found ${found.rows.length} organisations named "${name}" — refusing to guess. Delete by id manually.`);
    process.exit(1);
  }
  const org = found.rows[0].id;

  const [p, t, pr, l] = await Promise.all([
    client.query("SELECT count(*)::int AS n FROM profiles  WHERE org_id = $1", [org]),
    client.query("SELECT count(*)::int AS n FROM tenants   WHERE org_id = $1", [org]),
    client.query("SELECT count(*)::int AS n FROM properties WHERE org_id = $1", [org]).catch(() => ({ rows: [{ n: "?" }] })),
    client.query("SELECT count(*)::int AS n FROM landlords  WHERE org_id = $1", [org]).catch(() => ({ rows: [{ n: "?" }] })),
  ]);
  console.log(`Found "${name}"  (${org})`);
  console.log(`  profiles   : ${p.rows[0].n}`);
  console.log(`  tenants    : ${t.rows[0].n}`);
  console.log(`  properties : ${pr.rows[0].n}  (will cascade from org delete)`);
  console.log(`  landlords  : ${l.rows[0].n}  (will cascade from org delete)`);
  console.log("");

  const rl = createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question(`Type DELETE to wipe "${name}" and everything in it: `)).trim();
  rl.close();
  if (answer !== "DELETE") {
    console.log("Nothing changed.");
    process.exit(0);
  }

  await client.query("BEGIN");
  // profiles and tenants have no ON DELETE CASCADE to organisations — handle them first.
  await client.query("DELETE FROM profiles WHERE org_id = $1", [org]);
  await client.query("DELETE FROM tenants  WHERE org_id = $1", [org]);
  // Everything else that references organisations is ON DELETE CASCADE, so this one takes the rest.
  await client.query("DELETE FROM organisations WHERE id = $1", [org]);
  await client.query("COMMIT");

  console.log(`Done. "${name}" is gone; its admin email(s) are now free to reuse on /signup.`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
