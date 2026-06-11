import { NextResponse } from "next/server";
import { generateStrictlyGrounded, activeProvider } from "@tenant-hub/ai";
import { getApiAuth } from "../../../../lib/api-auth";
import { makeSecureGateway } from "../../../../lib/secure-gateway";

/**
 * POST /api/ai/task — open agent tasking. { tenantId?, prompt }.
 * Reads context through the SecureDbGateway (RLS, H2). The model may only
 * PROPOSE — it has no write path. Returns { response }.
 * Now utilizes Verifiable Explainability Model Layer for Strict Grounding.
 */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const prompt: string | undefined = body?.prompt;
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

  if (activeProvider() === "none") {
    return NextResponse.json({ response: "No AI provider is configured (set RUNCRATE_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY)." });
  }

  const gateway = makeSecureGateway();
  let facts: string[] = [];
  try {
    if (body.tenantId) {
      const tenants = await gateway.readTenants();
      const tenant = tenants.find(t => t.id === body.tenantId);
      const sessions = await gateway.readSessions(body.tenantId);
      
      if (tenant) {
        facts.push(`Tenant Name: ${tenant.full_name}`);
        facts.push(`Tenant Room: ${tenant.room_number}`);
        facts.push(`Tenant Date of Birth: ${tenant.dob}`);
        facts.push(`Tenant Benefit: ${tenant.benefit_type}`);
        facts.push(`Tenant Moved in: ${tenant.moved_in}`);
      }
      
      sessions.slice(0, 5).forEach((s) => {
        facts.push(`Session on ${s.session_date} (${s.session_type}): ${s.notes}`);
      });
    } else {
      const tenants = await gateway.readTenants();
      tenants.forEach(t => facts.push(`Active Tenant: ${t.full_name} in Room ${t.room_number}`));
    }
  } catch {
    /* facts are best-effort */
  }

  const system =
    "You are an assistant for a UK supported-housing manager. You have READ access " +
    "to tenant data via a secure gateway. You may only PROPOSE changes — never write " +
    "directly. Respond helpfully and professionally in a UK housing context.";

  try {
    const { text, claims, factMap } = await generateStrictlyGrounded({ 
      system, 
      prompt, 
      facts,
      maxTokens: 1500 
    });
    return NextResponse.json({ response: text, claims, factMap });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    // 422 if it's a grounding verification failure, else 500
    const status = message.includes("Grounding Verification Failed") ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
