/**
 * Browser Supabase client (RLS-respecting, anon key only).
 * Reads NEXT_PUBLIC_ vars directly — these are inlined by Next at build time
 * and are browser-safe. We deliberately do NOT import @tenant-hub/env here:
 * its parse step can call process.exit in a production build, which has no
 * meaning in the browser. The service-role key never touches this file.
 */
"use client";

import { createBrowserClient } from "@supabase/ssr";

let cached: ReturnType<typeof createBrowserClient> | null = null;

/**
 * True when a Supabase project is actually configured in this environment.
 * Check this before getSupabaseBrowser() anywhere the caller isn't willing
 * to crash — createBrowserClient() throws synchronously with no URL/key
 * (DECISIONS D27: Railway deployments run with none at all), and unlike a
 * failed fetch, a throw during render takes the whole component tree down
 * with it, not just the one feature that needed Supabase.
 */
export function hasSupabaseBrowser(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabaseBrowser() {
  if (cached) return cached;
  cached = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return cached;
}
