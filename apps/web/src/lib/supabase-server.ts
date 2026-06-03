/**
 * Server Supabase client (RLS-respecting, anon key + the user's session cookies).
 * Used by API routes and server components to run queries AS the authenticated
 * user — so RLS is enforced (H2: AI/UI never reach the DB without RLS).
 *
 * The service-role client stays quarantined in packages/db; this is the anon
 * client carrying the user's JWT from cookies.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@tenant-hub/env";

export function createSupabaseServer() {
  const cookieStore = cookies();

  return createServerClient(
    env.client.NEXT_PUBLIC_SUPABASE_URL,
    env.client.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          // In Server Components cookies() is read-only and throws; route
          // handlers and server actions can write. Swallow the RSC case.
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            /* read-only context */
          }
        },
        remove(name: string, options: Record<string, unknown>) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            /* read-only context */
          }
        },
      },
    },
  );
}
