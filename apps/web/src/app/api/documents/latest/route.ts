import { NextResponse } from "next/server";
import { withRouteHandler } from "../../../../lib/api-handler";

export const dynamic = "force-dynamic";

/**
 * GET /api/documents/latest?kind=digest — the single most recent
 * system-drafted document of a given kind (e.g. owner-digest's morning
 * summary, apps/worker/src/agents/owner-digest.ts). Gated the same way as
 * /api/needs-you — this is staff console reading, not a tenant-facing route.
 */
export const GET = withRouteHandler({ resource: "tenants", action: "read" }, async (req, _ctx, auth) => {
  const kind = new URL(req.url).searchParams.get("kind");
  if (!kind) return NextResponse.json({ error: "Missing kind" }, { status: 400 });

  const { data, error } = await auth.supabase
    .from("documents")
    .select("id, title, body, is_simulated, created_at")
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? null, { headers: { "Cache-Control": "no-store" } });
});
