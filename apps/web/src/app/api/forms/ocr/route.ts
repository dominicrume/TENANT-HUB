import { NextResponse } from "next/server";
import { complete, activeProvider } from "@tenant-hub/ai";
import { db } from "@tenant-hub/db";
import { getApiAuth } from "../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

interface FormSchemaField { id: string; label: string }

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
  if (!auth.actor.org_id) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Fetch the template schema, scoped to the caller's org (form_templates.org_id is NOT NULL).
  const templateR = await db().query<{ schema: FormSchemaField[]; name: string }>(
    "SELECT schema, name FROM form_templates WHERE id = $1 AND org_id = $2",
    [templateId, auth.actor.org_id],
  );
  const template = templateR.rows[0];
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const schemaKeys = template.schema.map((s) => `${s.id} (${s.label})`).join(", ");

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
    const message = toSafeErrorMessage(err, "Extraction failed");
    return NextResponse.json({ extracted: {}, error: message }, { status: 200 });
  }
}
