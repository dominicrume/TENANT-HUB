import { NextResponse } from "next/server";
import { complete, activeProvider } from "@tenant-hub/ai";
import { writeWithAudit } from "@tenant-hub/db";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../lib/api-auth";
import type { CanonicalTenant } from "@tenant-hub/validation";

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

  if (activeProvider() === "none") {
    return NextResponse.json({ error: "No AI provider configured" }, { status: 400 });
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

  // 2. Generate Plan using AI
  const prompt = `You are generating a formal "Reliance Support Plan" for a supported housing tenant.
Please write a professional, comprehensive support plan in Markdown format based on the following details:
- Name: ${tenant.full_name}
- Date of Birth: ${tenant.dob || "Unknown"}
- Nationality: ${tenant.nationality || "Unknown"}
- Moved In: ${tenant.moved_in || "Unknown"}
- Languages: ${tenant.languages || "Unknown"}
- Doctor/GP: ${tenant.doctor || "Unknown"}
- Probation Officer: ${tenant.probation_officer || "Unknown"}
- Next of Kin: ${tenant.nok_name || "Unknown"} (${tenant.nok_relationship || "Unknown"})

Structure the document with clear headings: 
1. Personal Overview 
2. Health & Wellbeing (mention GP details)
3. Risk & Probation (mention Probation details if applicable)
4. Emergency Contacts (mention Next of Kin)
5. Action Plan & Goals

Write it in a formal, supportive, UK-English tone suitable for a housing association file. Return ONLY the markdown.`;

  try {
    const rawMarkdown = await complete({ prompt, maxTokens: 1500 });
    const markdown = rawMarkdown.replace(/^```(?:markdown)?/i, "").replace(/```$/, "").trim();

    // 3. Upload to Supabase Storage
    const fileName = `support-plan-${tenantId}-${Date.now()}.md`;
    // We convert string to Blob for upload
    const blob = new Blob([markdown], { type: "text/markdown" });

    const { data: uploadData, error: uploadErr } = await auth.supabase.storage
      .from("tenant-documents")
      .upload(fileName, blob, { contentType: "text/markdown" });

    if (uploadErr) {
      throw new Error(`Failed to upload document: ${uploadErr.message}`);
    }

    const publicUrl = auth.supabase.storage.from("tenant-documents").getPublicUrl(uploadData.path).data.publicUrl;

    // 4. Create Tenant Document Record via writeWithAudit
    await writeWithAudit({
      table: "tenant_documents",
      action: "CREATE",
      record: {
        tenant_id: tenantId,
        name: "Reliance Support Plan (AI Generated)",
        file_url: publicUrl,
        uploaded_by: auth.actor.user_name,
      } as Record<string, unknown>,
      ...auth.actor,
    });

    // 5. Update Intake Checklist to mark initial_assessment = true
    await auth.supabase
      .from("intake_checklists")
      .update({ initial_assessment: true, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId);

    return NextResponse.json({ success: true, file_url: publicUrl });
  } catch (err) {
    console.error("[generate-plan]", err);
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
