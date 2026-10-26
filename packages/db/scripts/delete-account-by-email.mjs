#!/usr/bin/env node
/**
 * One-off: delete an account by email, including the Managing Agent
 * organisation that email signed up to (via /signup, so each self-signup
 * admin is the sole owner of their own org). "mattysplace200@gmail.com"
 * is the first case we're running this for (Rume, 2026-10-26).
 *
 * The script finds the profile, finds the org that profile sits in, shows
 * you what will go (people / tenants / properties / landlords), asks you
 * to type DELETE, and drops the whole thing inside one transaction with
 * `session_replication_role = replica` so FK triggers never block it —
 * same safe pattern wipe-managing-agent.mjs already uses.
 *
 * Does not delete profiles that are in an org with other members (which
 * would leave their org without an admin) — in that case it refuses and
 * tells you to use /settings → Users to remove them from the UI instead,
 * since the admin can issue a replacement first.
 *
 * Usage, from the repo root:
 *
 *   railway run --service Postgres -- \
 *     pnpm --filter=@tenant-hub/db exec node scripts/delete-account-by-email.mjs "mattysplace200@gmail.com"
 */
import pg from "pg";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const emailArg = process.argv[2]?.trim();
if (!emailArg) {
  console.error('Usage: node scripts/delete-account-by-email.mjs "<email>"');
  process.exit(1);
}
const email = emailArg.toLowerCase();
if (!/^\S+@\S+\.\S+$/.test(email)) {
  console.error(`"${emailArg}" isn't a valid email. Use the form name@domain.tld.`);
  process.exit(1);
}

const envUrl = process.env.DATABASE_PUBLIC_URL
  || (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes(".railway.internal") ? process.env.DATABASE_URL : null);
const { RAILWAY_TCP_PROXY_DOMAIN: proxyHost, RAILWAY_TCP_PROXY_PORT: proxyPort, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
const reconstructed = proxyHost && proxyPort && PGUSER && PGPASSWORD && PGDATABASE
  ? `postgresql://${encodeURIComponent(PGUSER)}:${encodeURIComponent(PGPASSWORD)}@${proxyHost}:${proxyPort}/${PGDATABASE}`
  : null;
const url = envUrl || reconstructed;
if (!url) {
  console.error("No reachable Postgres URL in env. Run with `railway run --service Postgres --` so the proxy vars are injected.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const profileR = await client.query(
    `SELECT p.id, p.full_name, p.role, p.org_id, o.name AS org_name
       FROM profiles p LEFT JOIN organisations o ON o.id = p.org_id
      WHERE lower(p.email) = $1`, [email]);
  if (profileR.rows.length === 0) {
    console.error(`No account exists on the platform with the email "${email}".`);
    console.error("Run `node scripts/reset-password.mjs --list` to see every profile and their org.");
    process.exit(1);
  }
  const profile = profileR.rows[0];
  const org = profile.org_id;
  const orgName = profile.org_name;

  if (!org) {
    // Rare: a profile with no org — nothing cascades. Delete just this row.
    console.log(`Found ${profile.full_name} <${email}> with NO organisation attached.`);
    const rl = createInterface({ input: stdin, output: stdout });
    const ans = (await rl.question("Type DELETE to remove this profile: ")).trim();
    rl.close();
    if (ans !== "DELETE") { console.log("Nothing changed."); process.exit(0); }
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = 'replica'");
    await client.query("DELETE FROM profiles WHERE id = $1", [profile.id]);
    await client.query("COMMIT");
    console.log(`Done. ${email} is now free to reuse on /signup.`);
    process.exit(0);
  }

  // Count what will be dropped if we take the whole org (which we do by default — a
  // self-signup account IS its organisation, there is no other admin to inherit it).
  const [memberCount, pR, tR, prR, lR] = await Promise.all([
    client.query("SELECT count(*)::int AS n FROM profiles WHERE org_id = $1 AND id <> $2", [org, profile.id]),
    client.query("SELECT count(*)::int AS n FROM profiles  WHERE org_id = $1", [org]),
    client.query("SELECT count(*)::int AS n FROM tenants   WHERE org_id = $1", [org]).catch(() => ({ rows: [{ n: 0 }] })),
    client.query("SELECT count(*)::int AS n FROM properties WHERE org_id = $1", [org]).catch(() => ({ rows: [{ n: 0 }] })),
    client.query("SELECT count(*)::int AS n FROM landlords  WHERE org_id = $1", [org]).catch(() => ({ rows: [{ n: 0 }] })),
  ]);
  const others = memberCount.rows[0].n;

  if (others > 0) {
    console.error(`Refusing: ${profile.full_name} is not the only member of "${orgName}" — there are ${others} other profile(s) attached.`);
    console.error("Deleting the org would wipe their data too. Open Settings → Users as that organisation's admin and Remove this one person from the people list; the rest of the org stays.");
    process.exit(2);
  }

  console.log(`Found ${profile.full_name} <${email}>`);
  console.log(`  Managing Agent      : ${orgName ?? "(unnamed)"}`);
  console.log(`  Role                : ${profile.role}`);
  console.log(`  Profiles in that org: ${pR.rows[0].n}  (this account only)`);
  console.log(`  Tenants             : ${tR.rows[0].n}`);
  console.log(`  Properties          : ${prR.rows[0].n}`);
  console.log(`  Landlords           : ${lR.rows[0].n}`);
  console.log("");

  const rl = createInterface({ input: stdin, output: stdout });
  const ans = (await rl.question(`Type DELETE to wipe the whole "${orgName}" organisation and everything in it: `)).trim();
  rl.close();
  if (ans !== "DELETE") { console.log("Nothing changed."); process.exit(0); }

  await client.query("BEGIN");
  // Same safe pattern wipe-managing-agent.mjs uses: FK triggers off for this one transaction only.
  await client.query("SET LOCAL session_replication_role = 'replica'");
  await client.query("DELETE FROM profiles WHERE org_id = $1", [org]);
  await client.query("DELETE FROM tenants  WHERE org_id = $1", [org]);
  await client.query("DELETE FROM organisations WHERE id = $1", [org]);
  await client.query("COMMIT");

  console.log(`Done. "${orgName}" is gone; ${email} is now free to reuse on /signup.`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
