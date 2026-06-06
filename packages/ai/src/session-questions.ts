/**
 * AI Brain — generate 3 follow-up questions from last session notes.
 * Receives a SecureDbGateway — never constructs its own Supabase client (H2).
 * Provider-agnostic via ./provider (OpenAI preferred).
 */
import type { SecureDbGateway } from "./gateway";
import { generateStrictlyGrounded } from "./grounding";

const FALLBACK = [
  "How have you been feeling since we last met?",
  "Have there been any changes to your housing situation?",
  "Is there anything you'd like support with this week?",
];

export async function generateSessionQuestions(
  tenantId: string,
  gateway: SecureDbGateway,
): Promise<string[]> {
  const sessions = await gateway.readSessions(tenantId);
  const lastSession = sessions[0];
  if (!lastSession) return FALLBACK;

  const facts = [`Session on ${lastSession.session_date}: ${lastSession.notes}`];
  
  const system = "You are a housing support worker assistant. You MUST format your response as a valid JSON array of 3 strings inside the 'text' field of the root JSON object. Example: { \"text\": \"[\\\"question 1\\\", \\\"question 2\\\", \\\"question 3\\\"]\", \"claims\": [...] }";
  
  const prompt = `Based strictly on the source facts, generate exactly 3 follow-up questions for the next session. 
Respond with ONLY the JSON object. No other text.`;

  try {
    const { text } = await generateStrictlyGrounded({ system, prompt, facts, maxTokens: 500 });
    
    // Tolerate fenced code blocks around the JSON array inside 'text'
    const json = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const questions = JSON.parse(json) as string[];
    return Array.isArray(questions) && questions.length ? questions.slice(0, 3) : FALLBACK;
  } catch (err) {
    // If it fails strict verification (break mechanism), return fallback
    console.warn("Strict Grounding Verification Failed for session questions.", err);
    return FALLBACK;
  }
}
