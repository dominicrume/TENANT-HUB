/**
 * Supabase client factory — QUARANTINED in packages/db.
 * This is the ONLY file in the monorepo that may import @supabase/supabase-js
 * for server-side operations with the service-role key.
 *
 * IMPORT THIS FILE ONLY FROM WITHIN packages/db.
 * The ESLint boundary config enforces this. Any import from outside
 * packages/db is a build failure.
 *
 * Exports:
 *  rlsClient    — uses anon key, respects RLS — safe for user-context operations
 *  adminClient  — uses service-role key — INTERNAL USE ONLY (writeWithAudit)
 */
import { createClient } from "@supabase/supabase-js";
import { env } from "@tenant-hub/env";
// RLS-respecting client — operations run as the authenticated user
export const rlsClient = createClient(env.server.SUPABASE_URL, env.client.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
// Service-role client — bypasses RLS — NEVER leak outside this package
const _adminClient = createClient(env.server.SUPABASE_URL, env.server.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// Only writeWithAudit may use this — not exported directly
export { _adminClient as adminClient };
