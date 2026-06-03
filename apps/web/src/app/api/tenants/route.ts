import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { TenantRepository, rlsClient } from "@tenant-hub/db";

/**
 * GET /api/tenants
 * Wires TenantRepository.findAll() to the UI. Consumed by the useTenants() hook,
 * which is the single source of truth for both the sidebar and the stats widget (H8).
 *
 * Production failure #1 ("silent 401s") is fixed here BY CONSTRUCTION:
 * an unauthenticated request returns an EXPLICIT 401 JSON error — never an
 * empty 200 that the UI would mistake for "this user has no tenants".
 *
 * NOTE: full Supabase Auth session wiring is a separate Sprint 1 task
 * (apps/web/src/app/(auth)/). Until that lands, the actor is resolved from the
 * sb-access-token cookie — the same cookie middleware.ts already gates on.
 */
export async function GET() {
  const token = cookies().get("sb-access-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { data: { user }, error: authError } = await rlsClient.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const actor = {
    user_id:   user.id,
    user_name: (user.user_metadata?.["full_name"] as string | undefined) ?? user.email ?? user.id,
    user_role: (user.app_metadata?.["role"] as string | undefined)
            ?? (user.user_metadata?.["role"] as string | undefined)
            ?? "tenant",
  };

  try {
    const tenants = await TenantRepository.findAll(actor);
    return NextResponse.json(tenants);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("GET /api/tenants:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
