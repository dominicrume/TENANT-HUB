import { NextResponse } from "next/server";
import { complete, activeProvider } from "@tenant-hub/ai";
import { getApiAuth } from "../../../../lib/api-auth";

export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (activeProvider() === "none") {
    return NextResponse.json({ extracted: {}, note: "No AI provider configured" });
  }

  const body = await req.json().catch(() => null);
  const text: string | undefined = body?.text;
  const image: string | undefined = body?.image;
  const templateId: string | undefined = body?.templateId;
  
  if (!templateId) return NextResponse.json({ error: "templateId required" }, { status: 400 });

  if (!text && !image) {
    return NextResponse.json({ extracted: {}, note: "No text or image supplied" });
  }

  // Fetch the template schema
  const { data: template, error } = await auth.supabase
    .from("form_templates")
    .select("schema, name")
    .eq("id", templateId)
    .single();

  if (error || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const schemaKeys = template.schema.map((s: any) => `${s.id} (${s.label})`).join(", ");

  let prompt = `You are extracting fields from a UK supported-housing form. The form type is: ${template.name}.
From the provided document, return ONLY a JSON object with any of these keys you can find:
${schemaKeys}.
If you cannot find a value for a key, omit it. Do not invent information. Do not include any commentary or markdown codeblocks outside of the raw JSON object.`;

  if (text) {
    prompt += `\n\nDOCUMENT TEXT:\n${text}`;
  }

  try {
    const raw = await complete({ prompt, image, maxTokens: 1000 });
    const json = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const extracted = JSON.parse(json) as Record<string, unknown>;
    return NextResponse.json({ extracted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ extracted: {}, error: message }, { status: 200 });
  }
}
