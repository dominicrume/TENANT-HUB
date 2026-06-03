import { NextResponse } from "next/server";
import { complete, activeProvider } from "@tenant-hub/ai";
import { getApiAuth } from "../../../../lib/api-auth";
import { makeSecureGateway } from "../../../../lib/secure-gateway";

/**
 * POST /api/ai/task — open agent tasking. { tenantId?, prompt }.
 * Reads context through the SecureDbGateway (RLS, H2). The model may only
 * PROPOSE — it has no write path. Returns { response }.
 */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const prompt: string | undefined = body?.prompt;
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

  if (activeProvider() === "none") {
    return NextResponse.json({ response: "No AI provider is configured (set OPENAI_API_KEY or ANTHROPIC_API_KEY)." });
  }

  const gateway = makeSecureGateway();
  let context = "";
  try {
    if (body.tenantId) {
      const sessions = await gateway.readSessions(body.tenantId);
      context = `Recent sessions:\n${sessions.slice(0, 5).map((s) => `- ${s.session_date} (${s.session_type}): ${s.notes}`).join("\n")}`;
    } else {
      const tenants = await gateway.readTenants();
      context = `Active tenants: ${tenants.map((t) => `${t.full_name} (${t.room_number})`).join(", ")}`;
    }
  } catch {
    /* context is best-effort */
  }

  const system =
    "You are an assistant for a UK supported-housing manager. You have READ access " +
    "to tenant data via a secure gateway. You may only PROPOSE changes — never write " +
    "directly. Respond helpfully and professionally in a UK housing context.";

  try {
    const response = await complete({ system, prompt: `${prompt}\n\n${context}`, maxTokens: 900 });
    return NextResponse.json({ response });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
