import { complete } from "./provider";
import { shortHashFact } from "./crypto";

export interface EntailmentClaim {
  claim: string;
  factHash: string;
}

export interface FactMap {
  [hash: string]: string; // hash -> original fact text
}

/**
 * Strict Grounding Verifier ("The Judge").
 * Mathematically validates that every generated claim anchors to a valid Source Fact Hash.
 * If the LLM generates a hash that does not exist in the FactMap, it is mathematically
 * proven to be a hallucination (drift), and the protocol throws an error.
 */
export function verifyGrounding(claims: EntailmentClaim[], factMap: FactMap): void {
  for (const item of claims) {
    if (!item.factHash || !factMap[item.factHash]) {
      throw new Error(`Grounding Verification Failed: The claim "${item.claim}" anchors to an invalid or hallucinated Fact Hash (${item.factHash}).`);
    }
  }
}

/**
 * Generates a response strictly derived from the provided discrete facts.
 * Enforces Cryptographic Faithfulness Anchoring by requiring structured Entailment Proofs.
 */
export async function generateStrictlyGrounded(opts: {
  system: string;
  prompt: string;
  facts: string[]; // Array of discrete facts (e.g. ["Name: John", "Room: 12A"])
  maxTokens?: number;
}): Promise<{ text: string; claims: EntailmentClaim[]; factMap: FactMap }> {
  
  // 1. Build the FactMap (Merkle-like Dictionary)
  const factMap: FactMap = {};
  let contextBlock = "";
  
  for (const fact of opts.facts) {
    const hash = await shortHashFact(fact);
    factMap[hash] = fact;
    contextBlock += `[HASH: ${hash}] ${fact}\n`;
  }

  const strictSystem = `${opts.system}
CRITICAL INSTRUCTION: You MUST base your answer strictly and exclusively on the provided SOURCE FACTS. 
You must output ONLY a valid JSON object matching this schema:
{
  "text": "Your cohesive human-readable response summarizing the claims.",
  "claims": [
    {
      "claim": "A discrete factual assertion",
      "factHash": "The EXACT HASH of the source fact that proves this claim"
    }
  ]
}
Do NOT invent information. If the context does not contain the answer, output a polite refusal in 'text' and an empty 'claims' array.`;

  const fullPrompt = `SOURCE FACTS:\n---\n${contextBlock}\n---\n\nUSER PROMPT:\n---\n${opts.prompt}`;

  // 2. Generate Entailment Proof
  const rawResponse = await complete({
    system: strictSystem,
    prompt: fullPrompt,
    maxTokens: opts.maxTokens ?? 1500,
  });

  // 3. Parse JSON safely
  let payload: { text: string; claims: EntailmentClaim[] };
  try {
    const jsonStr = rawResponse.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    payload = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Grounding Verification Failed: LLM failed to output structured Entailment Proof. Raw: ${rawResponse}`);
  }

  // 4. Strict Cryptographic Verification (Break mechanism)
  verifyGrounding(payload.claims || [], factMap);

  // 5. Return the verified payload and the FactMap for auditability
  return {
    text: payload.text,
    claims: payload.claims || [],
    factMap,
  };
}
