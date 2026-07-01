import { NextResponse } from "next/server";
import { generateStrictlyGrounded, activeProvider } from "@tenant-hub/ai";
import { getApiAuth } from "../../../../lib/api-auth";
import { makeSecureGateway } from "../../../../lib/secure-gateway";

export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !body.tenantId || !body.template) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { tenantId, template } = body;

  if (activeProvider() === "none") {
    return NextResponse.json({ simulated: true });
  }

  try {
    const gateway = makeSecureGateway();
    const tenants = await gateway.readTenants();
    const tenant = tenants.find((t: any) => t.id === tenantId);
    const sessions = await gateway.readSessions(tenantId);

    const facts: string[] = [];
    if (tenant) {
      facts.push(`Tenant: ${tenant.full_name}, DOB: ${tenant.dob}, Room: ${tenant.room_number}, Benefit: ${tenant.benefit_type}`);
    }
    sessions.slice(0, 10).forEach((s: any) => {
      facts.push(`Session (${s.session_date}): ${s.notes}`);
    });

    const schemaKeys = template.schema.map((s: any) => `"${s.id}": <value based on ${s.label}>`).join(", ");
    const prompt = `Fill out the form based on the facts provided. The form has the following fields to be filled out: ${JSON.stringify(template.schema)}. Return a valid JSON object matching these exact keys: { ${schemaKeys} }. Only include JSON in your response.`;

    const response = await generateStrictlyGrounded({
      facts,
      prompt,
      system: "You are an AI assistant helping a support worker fill out a form for a tenant."
    });

    try {
      const jsonStr = response.text.replace(/```json|```/g, "").trim();
      const extractedData = JSON.parse(jsonStr);
      return NextResponse.json({ data: extractedData });
    } catch (parseErr) {
      console.error("AI Extracted non-JSON:", response);
      return NextResponse.json({ simulated: true }); // Fallback
    }

  } catch (err: any) {
    console.error("Extract Form API Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
