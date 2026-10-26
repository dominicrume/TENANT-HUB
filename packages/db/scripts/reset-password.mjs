#!/usr/bin/env node
/**
 * One-off: reset a user's password by email, when the "Forgot it?" link
 * can't reach them (Resend domain unverified → no password-reset email
 * leaves the platform). Osama ran into this on 2026-10-26; this is the
 * script that unblocks any similar case.
 *
 * Generates a new password, hashes it with the EXACT same scrypt format
 * `packages/auth/src/password.ts` writes (so Tenant Hub's login verifier
 * accepts it as its own), updates the profile, and PRINTS the password so
 * you can WhatsApp it to them.
 *
 * Also kills every existing session for that profile so the old password
 * (if cached in some tab) stops working the moment the new one is handed
 * over.
 *
 * Usage, from the repo root:
 *
 *   railway run --service Postgres -- \
 *     pnpm --filter=@tenant-hub/db exec node scripts/reset-password.mjs "loumilli@reliableliving.co.uk"
 */
import pg from "pg";
import { randomBytes, scrypt as scryptCb } from "node:crypto";

const arg = process.argv[2]?.trim();
if (!arg) {
  console.error('Usage: node scripts/reset-password.mjs "<email>"');
  console.error('       node scripts/reset-password.mjs --list              # list every profile on the platform');
  process.exit(1);
}
const email = arg.toLowerCase();
const listMode = arg === "--list";
if (!listMode && !/^\S+@\S+\.\S+$/.test(email)) {
  console.error(`"${arg}" isn't a valid email. Use the form name@domain.tld.`);
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

const SCRYPT_N = 16384, SCRYPT_R = 8, SCRYPT_P = 1, KEY_LENGTH = 64;
function scrypt(password, salt, keylen, options) {
  return new Promise((resolve, reject) => scryptCb(password, salt, keylen, options, (err, k) => (err ? reject(err) : resolve(k))));
}
async function hashPassword(plain) {
  const salt = randomBytes(16);
  const derived = await scrypt(plain, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}
// Readable but not weak — three short words + a two-digit number + a symbol.
function generatePassword() {
  const words = ["river","forest","quiet","orange","silver","amber","harbour","meadow","north","oak","garden","pepper","mountain","summer","valley","compass"];
  const sym = "!@#$%^&*".charAt(Math.floor(Math.random() * 8));
  const w = () => words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(10 + Math.random() * 89);
  return `${w()}-${w()}-${w()}${n}${sym}`;
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  if (listMode) {
    const all = await client.query(
      `SELECT p.email, p.full_name, p.role, o.name AS org_name
         FROM profiles p LEFT JOIN organisations o ON o.id = p.org_id
        ORDER BY o.name NULLS LAST, p.full_name`
    );
    if (all.rows.length === 0) { console.log("No profiles on the platform yet."); process.exit(0); }
    console.log(`Every profile on the platform (${all.rows.length}):`);
    let curOrg = "";
    for (const row of all.rows) {
      if (row.org_name !== curOrg) { curOrg = row.org_name ?? "(no org)"; console.log(`\n== ${curOrg} ==`); }
      console.log(`  ${row.email.padEnd(40)}  ${row.full_name.padEnd(28)}  ${row.role}`);
    }
    process.exit(0);
  }

  const r = await client.query("SELECT id, full_name, org_id FROM profiles WHERE lower(email) = $1", [email]);
  if (r.rows.length === 0) {
    console.error(`No profile with the exact email "${email}" exists on the platform.`);
    // Try to help: fuzzy-search by any token in the email / name against every profile.
    const needle = email.split("@")[0].toLowerCase();
    const near = await client.query(
      `SELECT p.email, p.full_name, o.name AS org_name
         FROM profiles p LEFT JOIN organisations o ON o.id = p.org_id
        WHERE lower(p.email) LIKE $1 OR lower(p.full_name) LIKE $1
        ORDER BY p.full_name LIMIT 15`,
      [`%${needle}%`]
    );
    if (near.rows.length > 0) {
      console.error("\nDid you mean one of these?");
      for (const row of near.rows) console.error(`  ${row.email}  —  ${row.full_name}${row.org_name ? ` · ${row.org_name}` : ""}`);
      console.error("\nRe-run with the correct email in quotes.");
    } else {
      console.error("\nNothing matched the characters before the @. Either the account was never created, or it's under a different email entirely.");
      console.error("To see every profile on the platform, run:");
      console.error('  railway run --service Postgres -- pnpm --filter=@tenant-hub/db exec node scripts/reset-password.mjs --list');
    }
    process.exit(1);
  }
  const { id, full_name } = r.rows[0];
  const password = generatePassword();
  const hash = await hashPassword(password);

  await client.query("BEGIN");
  await client.query("UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2", [hash, id]);
  // Any existing session cookie stops working the moment we blow the sessions row away.
  await client.query("DELETE FROM user_sessions WHERE profile_id = $1", [id]).catch(() => {});
  await client.query("COMMIT");

  console.log("Password reset — tell them to use these:");
  console.log("  Email:    " + email);
  console.log("  Password: " + password);
  console.log(`  (for ${full_name}, every previous session has been signed out)`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
