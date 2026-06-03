/**
 * Middleware Supabase client — reads cookies off the incoming request and
 * writes refreshed session cookies onto the outgoing response. Returns both so
 * middleware.ts can check the session and still forward the (possibly cookie-
 * mutated) response.
 */
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@tenant-hub/env";

export function createSupabaseMiddleware(req: NextRequest) {
  const res = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(
    env.client.NEXT_PUBLIC_SUPABASE_URL,
    env.client.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: Record<string, unknown>) {
          res.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  return { supabase, res };
}
