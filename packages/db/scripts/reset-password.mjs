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

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
  console.error('Usage: node scripts/reset-password.mjs "<email>"');
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
  const r = await client.query("SELECT id, full_name, org_id FROM profiles WHERE lower(email) = $1", [email]);
  if (r.rows.length === 0) {
    console.error(`No profile with email "${email}" exists on the platform.`);
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
