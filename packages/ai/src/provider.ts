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
  image?: string; // base64 data url
}

export function activeProvider(): "openai" | "anthropic" | "none" {
  if (process.env["OPENAI_API_KEY"]) return "openai";
  if (process.env["ANTHROPIC_API_KEY"]) return "anthropic";
  return "none";
}

export async function complete(opts: CompleteOptions): Promise<string> {
  const maxTokens = opts.maxTokens ?? 400;

  if (process.env["OPENAI_API_KEY"]) {
    try {
      const openai = new OpenAI();
      const res = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: maxTokens,
        messages: [
          ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
          { 
            role: "user" as const, 
            content: opts.image 
              ? [
                  { type: "text", text: opts.prompt },
                  { type: "image_url", image_url: { url: opts.image } }
                ] 
              : opts.prompt 
          },
        ],
      });
      return res.choices[0]?.message?.content ?? "";
    } catch (err: any) {
      console.warn("OpenAI API failed, attempting Anthropic fallback. Error:", err?.message);
      if (!process.env["ANTHROPIC_API_KEY"]) {
        throw err;
      }
    }
  }

  if (process.env["ANTHROPIC_API_KEY"]) {
    const anthropic = new Anthropic();
    
    let content: any = opts.prompt;
    if (opts.image) {
      const parts = opts.image.split(",");
      const meta = parts[0] || "";
      const data = parts[1] || "";
      const mediaParts = meta.split(":");
      const mediaStr = mediaParts.length > 1 ? mediaParts[1] : "";
      const media_type = mediaStr ? mediaStr.split(";")[0] : "image/jpeg";
      
      content = [
        { 
          type: "image", 
          source: { 
            type: "base64", 
            media_type: media_type as any, 
            data 
          } 
        },
        { type: "text", text: opts.prompt }
      ];
    }

    const res = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: maxTokens,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content }],
    });
    const block = res.content[0];
    return block?.type === "text" ? block.text : "";
  }

  return "";
}
