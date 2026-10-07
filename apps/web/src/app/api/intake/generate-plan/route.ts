import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { getApiAuth } from "../../../../lib/api-auth";
import { can } from "@tenant-hub/auth";
import { generateSupportPlan } from "../../../../lib/generate-plan";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

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
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const tenantR = await db().query<Record<string, unknown>>("SELECT * FROM tenants WHERE id = $1 AND org_id = $2", [tenantId, auth.actor.org_id]);
  const tenant = tenantR.rows[0];

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  try {
    const publicUrl = await generateSupportPlan(tenantId, tenant, auth.actor, auth.supabase);
    return NextResponse.json({ success: true, file_url: publicUrl });
  } catch (err) {
    console.error("[generate-plan]", err);
    const message = toSafeErrorMessage(err, "Generation failed");
    // Propagate 400 if no AI provider configured
    if (message === "No AI provider configured") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
