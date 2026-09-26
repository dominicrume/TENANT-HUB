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
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@tenant-hub/env";

/**
 * Lazy: nothing is constructed until first use, so packages/db can be imported
 * (and tested on pglite) without Supabase variables. These clients are the
 * legacy path and are removed at C43 (docs/PLATFORM_CONSOLIDATION.md step 6).
 */
function lazy<T extends object>(make: () => T): T {
  let inst: T | null = null;
  return new Proxy({} as T, {
    get(_t, prop) {
      inst ??= make();
      const v = (inst as unknown as Record<PropertyKey, unknown>)[prop];
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(inst) : v;
    },
  });
}

// RLS-respecting client — operations run as the authenticated user
export const rlsClient: SupabaseClient = lazy(() =>
  createClient(env.server.SUPABASE_URL, env.client.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }));

// Service-role client — bypasses RLS — NEVER leak outside this package
const _adminClient: SupabaseClient = lazy(() =>
  createClient(env.server.SUPABASE_URL, env.server.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }));

// Only writeWithAudit and the purpose-built read modules may use this — not exported from the package index
export { _adminClient as adminClient };
