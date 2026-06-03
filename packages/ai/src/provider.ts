/**
 * AI provider abstraction. Picks OpenAI when OPENAI_API_KEY is set (the user's
 * stated preference, DECISIONS.md D3), otherwise Anthropic. Callers stay
 * provider-agnostic. This package never touches the DB — only the model API.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export interface CompleteOptions {
  prompt: string;
  system?: string;
  maxTokens?: number;
}

export function activeProvider(): "openai" | "anthropic" | "none" {
  if (process.env["OPENAI_API_KEY"]) return "openai";
  if (process.env["ANTHROPIC_API_KEY"]) return "anthropic";
  return "none";
}

/** Single-shot completion. Returns plain text (empty string on no provider). */
export async function complete(opts: CompleteOptions): Promise<string> {
  const maxTokens = opts.maxTokens ?? 400;
  const provider = activeProvider();

  if (provider === "openai") {
    const openai = new OpenAI();
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: maxTokens,
      messages: [
        ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
        { role: "user" as const, content: opts.prompt },
      ],
    });
    return res.choices[0]?.message?.content ?? "";
  }

  if (provider === "anthropic") {
    const anthropic = new Anthropic();
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content: opts.prompt }],
    });
    const block = res.content[0];
    return block?.type === "text" ? block.text : "";
  }

  return "";
}
