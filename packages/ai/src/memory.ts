/**
 * Interaction memory: a staff note, session or communication → a one-line
 * summary, plus any promise inside it lifted into its own commitment. Same
 * split as triage.ts's classifier and this package's other pure/AI split:
 * commitments are extracted by deterministic rules ONLY, never by the LLM —
 * a promise on the record is something a person can be held to, so it must
 * come from a rule a person can read, not a model's guess (H9's spirit
 * applied here: nothing agent-drafted stands in for what was actually
 * written). The LLM, when configured and reachable, only sharpens the prose
 * summary; on any failure the rule-based summary takes over, same as
 * triage.ts's fallback.
 */
import { complete, activeProvider } from "./provider";
import type { CommitmentOwner } from "@tenant-hub/validation";

export interface ExtractedCommitment { text: string; owner: CommitmentOwner; due_on: string | null }
export interface InteractionMemory { summary: string; commitments: ExtractedCommitment[]; source: string; mode: "live" }

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const COMMITMENT_CUE = /\b(will|shall|going to|promised? to|agreed to|plans? to|planned to)\b/i;
const OWNER_CUES: [CommitmentOwner, RegExp][] = [
  ["tenant", /\btenant\b/i],
  ["contractor", /\b(contractor|trade(sperson)?|plumber|electrician|engineer)\b/i],
  ["council", /\b(council|housing benefit|\bhb\b)\b/i],
  ["landlord", /\b(landlord|owner)\b/i],
];

function splitSentences(text: string): string[] {
  return (text || "").split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

/** "by 2026-03-05", "by 05/03/2026", "by tomorrow", "by next week", "by Friday" — the small set a real note actually uses. */
export function parseDueDate(sentence: string, from = new Date()): string | null {
  const iso = sentence.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1] ?? null;
  const uk = sentence.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (uk) { const [, d, m, y] = uk; return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`; }
  if (/\btomorrow\b/i.test(sentence)) { const d = new Date(from); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
  if (/\bnext week\b/i.test(sentence)) { const d = new Date(from); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); }
  const wd = sentence.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[1]!.toLowerCase());
    const d = new Date(from);
    d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7));
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/** Deterministic, transparent, always available — the only path a commitment is ever lifted through. */
export function extractCommitmentsByRules(text: string): ExtractedCommitment[] {
  const out: ExtractedCommitment[] = [];
  for (const sentence of splitSentences(text)) {
    if (!COMMITMENT_CUE.test(sentence)) continue;
    const owner = OWNER_CUES.find(([, re]) => re.test(sentence))?.[0] ?? "support_worker";
    out.push({ text: sentence, owner, due_on: parseDueDate(sentence) });
  }
  return out;
}

/** First sentence, capped — good enough to scan a list of interactions, no provider needed. */
export function summariseByRules(text: string): string {
  const t = (text || "").trim();
  if (!t) return "";
  const first = splitSentences(t)[0] ?? t;
  return first.length > 140 ? `${first.slice(0, 137)}...` : first;
}

/** A staff note, session or communication → a one-line summary and its promises. AI sharpens the summary when configured; commitments are always rule-extracted. */
export async function summariseInteraction(text: string): Promise<InteractionMemory> {
  const commitments = extractCommitmentsByRules(text);
  const provider = activeProvider();
  if (provider === "none") return { summary: summariseByRules(text), commitments, source: "rules:memory", mode: "live" };
  try {
    const raw = await complete({
      system: "Summarise this housing support interaction note in one short, plain sentence. No headers, no bullet points, no quotation marks.",
      prompt: text,
      maxTokens: 120,
    });
    const summary = raw.trim().replace(/^"|"$/g, "") || summariseByRules(text);
    return { summary, commitments, source: provider, mode: "live" };
  } catch {
    return { summary: summariseByRules(text), commitments, source: "rules:memory(fallback)", mode: "live" };
  }
}
