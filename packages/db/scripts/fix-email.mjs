#!/usr/bin/env node
/**
 * One-off: change a profile's email in place when they signed up with a
 * typo (Osama put `.co.un` instead of `.co.uk`; the account is otherwise
 * fine — password, org, everything). Keeps the profile, the org, and all
 * the audit history pointing at this person; the only change is the
 * `profiles.email` cell plus any mirror in `issued_credentials.email`.
 *
 * Usage, from the repo root:
 *
 *   railway run --service Postgres -- \
 *     pnpm --filter=@tenant-hub/db exec node scripts/fix-email.mjs \
 *       "loumilli@reliableliving.co.un" "loumilli@reliableliving.co.uk"
 */
import pg from "pg";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const oldArg = process.argv[2]?.trim();
const newArg = process.argv[3]?.trim();
if (!oldArg || !newArg) {
  console.error('Usage: node scripts/fix-email.mjs "<current email>" "<correct email>"');
  process.exit(1);
}
const oldEmail = oldArg.toLowerCase();
const newEmail = newArg.toLowerCase();
if (!/^\S+@\S+\.\S+$/.test(newEmail)) {
  console.error(`"${newArg}" isn't a valid email. Use the form name@domain.tld.`);
  process.exit(1);
}
if (oldEmail === newEmail) {
  console.log("Same email — nothing to change.");
  process.exit(0);
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
  const r = await client.query(
    `SELECT p.id, p.full_name, p.role, o.name AS org_name
       FROM profiles p LEFT JOIN organisations o ON o.id = p.org_id
      WHERE lower(p.email) = $1`, [oldEmail]);
  if (r.rows.length === 0) {
    console.error(`No profile exists with the email "${oldEmail}" on the platform.`);
    console.error("Run `node scripts/reset-password.mjs --list` to see every profile and copy the real email exactly.");
    process.exit(1);
  }
  const profile = r.rows[0];

  const clash = await client.query("SELECT full_name FROM profiles WHERE lower(email) = $1 AND id <> $2", [newEmail, profile.id]);
  if (clash.rows[0]) {
    console.error(`Refusing: "${newEmail}" already belongs to ${clash.rows[0].full_name}. Pick a different email, or delete that other account first.`);
    process.exit(2);
  }

  console.log(`Found ${profile.full_name} <${oldEmail}>`);
  console.log(`  Managing Agent : ${profile.org_name ?? "(no org)"}`);
  console.log(`  Role           : ${profile.role}`);
  console.log(`  New email      : ${newEmail}`);
  console.log("");

  const rl = createInterface({ input: stdin, output: stdout });
  const ans = (await rl.question("Type YES to change the email in place (password and everything else stays): ")).trim();
  rl.close();
  if (ans !== "YES") { console.log("Nothing changed."); process.exit(0); }

  await client.query("BEGIN");
  await client.query("UPDATE profiles SET email = $1, updated_at = NOW() WHERE id = $2", [newEmail, profile.id]);
  // issued_credentials carries an email mirror used by Reveal/Re-issue — keep it in sync so later reveals name the right address.
  await client.query("UPDATE issued_credentials SET email = $1 WHERE profile_id = $2", [newEmail, profile.id]).catch(() => {});
  await client.query("COMMIT");

  console.log(`Done. ${profile.full_name} now signs in with ${newEmail}; the password they already have is unchanged.`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
