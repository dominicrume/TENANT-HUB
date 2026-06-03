import { NextResponse } from "next/server";
import { generateSessionQuestions } from "@tenant-hub/ai";
import { getApiAuth } from "../../../../lib/api-auth";
import { makeSecureGateway } from "../../../../lib/secure-gateway";

/**
 * GET /api/ai/questions?tenantId=[id]
 * Reads the tenant's last sessions through a SecureDbGateway (RLS, H2) and asks
 * the AI for 3 follow-up questions. Returns a string[] (falls back to generic
 * questions if there's no session history or no AI provider configured).
 */
export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const tenantId = new URL(req.url).searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  try {
    const questions = await generateSessionQuestions(tenantId, makeSecureGateway());
    return NextResponse.json(questions);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
