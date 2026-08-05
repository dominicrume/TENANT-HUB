import { NextResponse } from "next/server";
import { getApiAuth } from "../../../../lib/api-auth";
import { can } from "@tenant-hub/auth";
import { generateSupportPlan } from "../../../../lib/generate-plan";

/**
 * POST /api/intake/generate-plan — generates a Reliance Support Plan for a tenant
 * using the configured AI provider, and stores it in the `tenant-documents` bucket.
 * 
 * Body: { tenantId: string }
 */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "intake_checklists", "update")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { tenantId } = (await req.json().catch(() => ({}))) as { tenantId?: string };
  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  // 1. Fetch Tenant
  const { data: tenant, error: tErr } = await auth.supabase
    .from("tenants")
    .select("*")
    .eq("id", tenantId)
    .single();

  if (tErr || !tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  try {
    const publicUrl = await generateSupportPlan(tenantId, tenant, auth.actor, auth.supabase);
    return NextResponse.json({ success: true, file_url: publicUrl });
  } catch (err) {
    console.error("[generate-plan]", err);
    const message = err instanceof Error ? err.message : "Generation failed";
    // Propagate 400 if no AI provider configured
    if (message === "No AI provider configured") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
