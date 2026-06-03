/**
 * AI Brain — generate 3 follow-up questions from last session notes.
 * Receives a SecureDbGateway — never constructs its own Supabase client (H2).
 * Provider-agnostic via ./provider (OpenAI preferred).
 */
import type { SecureDbGateway } from "./gateway";
import { complete } from "./provider";

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

  const prompt = `You are a housing support worker assistant.
Based on these notes from the last session, generate exactly 3
follow-up questions for the next session. Be specific to the notes.
Be compassionate and professional.

Last session (${lastSession.session_date}):
${lastSession.notes}

Respond with ONLY a JSON array of 3 question strings. No other text.`;

  const text = await complete({ prompt, maxTokens: 300 });
  if (!text) return FALLBACK;

  try {
    // Tolerate fenced code blocks around the JSON.
    const json = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const questions = JSON.parse(json) as string[];
    return Array.isArray(questions) && questions.length ? questions.slice(0, 3) : FALLBACK;
  } catch {
    return FALLBACK;
  }
}
