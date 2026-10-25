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

// Pick a Postgres URL that resolves from this machine. In order of preference:
//   1. DATABASE_PUBLIC_URL — some Postgres plugins set this directly.
//   2. DATABASE_URL — only when it ISN'T the internal .railway.internal host.
//   3. Reconstructed from the TCP-proxy pieces Railway exposes when the proxy is enabled:
//      RAILWAY_TCP_PROXY_DOMAIN + RAILWAY_TCP_PROXY_PORT + PGUSER + PGPASSWORD + PGDATABASE.
const envUrl = process.env.DATABASE_PUBLIC_URL
  || (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes(".railway.internal") ? process.env.DATABASE_URL : null);
const { RAILWAY_TCP_PROXY_DOMAIN: proxyHost, RAILWAY_TCP_PROXY_PORT: proxyPort, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
const reconstructed = proxyHost && proxyPort && PGUSER && PGPASSWORD && PGDATABASE
  ? `postgresql://${encodeURIComponent(PGUSER)}:${encodeURIComponent(PGPASSWORD)}@${proxyHost}:${proxyPort}/${PGDATABASE}`
  : null;
const url = envUrl || reconstructed;

if (!url) {
  console.error(
    "No reachable Postgres URL in env.\n" +
    "Run with `railway run --service Postgres --` so the Postgres env is injected.\n" +
    "Vars this script looked for (none were usable):\n" +
    `  DATABASE_PUBLIC_URL        = ${process.env.DATABASE_PUBLIC_URL ? "set" : "unset"}\n` +
    `  DATABASE_URL               = ${process.env.DATABASE_URL ? (process.env.DATABASE_URL.includes(".railway.internal") ? "internal (unreachable from your Mac)" : "set") : "unset"}\n` +
    `  RAILWAY_TCP_PROXY_DOMAIN   = ${proxyHost ?? "unset"}\n` +
    `  RAILWAY_TCP_PROXY_PORT     = ${proxyPort ?? "unset"}\n` +
    `  PGUSER / PGPASSWORD / PGDATABASE = ${PGUSER ? "set" : "unset"} / ${PGPASSWORD ? "set" : "unset"} / ${PGDATABASE ?? "unset"}\n` +
    "If the TCP proxy isn't enabled, run `railway tcp-proxy list --service Postgres` to see it, or set DATABASE_URL manually before calling this script."
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

  // A pg Client can only run one query at a time — serialize these.
  const p  = await client.query("SELECT count(*)::int AS n FROM profiles  WHERE org_id = $1", [org]);
  const t  = await client.query("SELECT count(*)::int AS n FROM tenants   WHERE org_id = $1", [org]);
  const pr = await client.query("SELECT count(*)::int AS n FROM properties WHERE org_id = $1", [org]).catch(() => ({ rows: [{ n: "?" }] }));
  const l  = await client.query("SELECT count(*)::int AS n FROM landlords  WHERE org_id = $1", [org]).catch(() => ({ rows: [{ n: "?" }] }));
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
  // Disable FK triggers for this one transaction — half a dozen tables (tenants.created_by,
  // sessions.entered_by, diary_entries.created_by/assigned_to, audit_logs.actor_id, etc.)
  // reference profiles without ON DELETE CASCADE, and nothing we delete has to be consistent
  // with the rest of the DB afterwards: it's all going. Resets automatically at COMMIT because
  // of SET LOCAL. Needs the role to be superuser on Railway's Postgres — it is, by default.
  await client.query("SET LOCAL session_replication_role = 'replica'");
  await client.query("DELETE FROM profiles WHERE org_id = $1", [org]);
  await client.query("DELETE FROM tenants  WHERE org_id = $1", [org]);
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
