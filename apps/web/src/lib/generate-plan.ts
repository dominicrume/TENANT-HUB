import { complete, activeProvider } from "@tenant-hub/ai";
import { writeWithAudit } from "@tenant-hub/db";
import { SupabaseClient } from "@supabase/supabase-js";

export async function generateSupportPlan(
  tenantId: string,
  tenant: Record<string, any>,
  actor: { user_id: string; user_name: string; user_role: string; org_id?: string },
  supabase: SupabaseClient<any, any, any>
) {
  if (activeProvider() === "none") {
    throw new Error("No AI provider configured");
  }

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

  const rawMarkdown = await complete({ prompt, maxTokens: 1500 });
  const markdown = rawMarkdown.replace(/^```(?:markdown)?/i, "").replace(/```$/, "").trim();

  const fileName = `support-plan-${tenantId}-${Date.now()}.md`;
  const blob = new Blob([markdown], { type: "text/markdown" });

  const { data: uploadData, error: uploadErr } = await supabase.storage
    .from("tenant-documents")
    .upload(fileName, blob, { contentType: "text/markdown" });

  if (uploadErr) {
    throw new Error(`Failed to upload document: ${uploadErr.message}`);
  }

  const publicUrl = supabase.storage.from("tenant-documents").getPublicUrl(uploadData.path).data.publicUrl;

  await writeWithAudit({
    table: "tenant_documents",
    action: "CREATE",
    record: {
      tenant_id: tenantId,
      name: "Reliance Support Plan (AI Generated)",
      file_url: publicUrl,
      uploaded_by: actor.user_name,
    } as Record<string, unknown>,
    ...actor,
  });

  await supabase
    .from("intake_checklists")
    .update({ initial_assessment: true, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);

  return publicUrl;
}
