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

export function activeProvider(): "runcrate" | "openai" | "anthropic" | "none" {
  if (process.env["RUNCRATE_API_KEY"]) return "runcrate";
  if (process.env["OPENAI_API_KEY"]) return "openai";
  if (process.env["ANTHROPIC_API_KEY"]) return "anthropic";
  return "none";
}

export async function complete(opts: CompleteOptions): Promise<string> {
  const maxTokens = opts.maxTokens ?? 400;
  const errors: string[] = [];
  
  // If this is a vision task, DeepSeek-V3 (text-only) will fail. Try OpenAI/Anthropic first.
  const requiresVision = !!opts.image;

  if (!requiresVision && process.env["RUNCRATE_API_KEY"]) {
    try {
      const openai = new OpenAI({
        baseURL: "https://api.runcrate.ai/v1",
        apiKey: process.env["RUNCRATE_API_KEY"],
      });
      const res = await openai.chat.completions.create({
        model: "deepseek-ai/DeepSeek-V3",
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
      const msg = `RunCrate API failed: ${err?.message || "Unknown error"}`;
      console.warn(msg);
      errors.push(msg);
    }
  }

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
      const msg = `OpenAI API failed: ${err?.message || "Unknown error"}`;
      console.warn(msg);
      errors.push(msg);
    }
  }

  if (process.env["ANTHROPIC_API_KEY"]) {
    try {
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
    } catch (err: any) {
      const msg = `Anthropic API failed: ${err?.message || "Unknown error"}`;
      console.warn(msg);
      errors.push(msg);
    }
  }

  if (errors.length > 0) {
    throw new Error(`AI completion failed: ${errors.join(" | ")}`);
  }

  throw new Error("No AI provider is configured (set RUNCRATE_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY).");
}

export async function transcribe(audioFile: File | Blob): Promise<string> {
  if (process.env["OPENAI_API_KEY"]) {
    try {
      const openai = new OpenAI();
      const res = await openai.audio.transcriptions.create({
        file: audioFile as any,
        model: "whisper-1",
      });
      return res.text;
    } catch (err: any) {
      console.warn("OpenAI Whisper API failed:", err?.message);
      throw err;
    }
  }
  throw new Error("No OpenAI API key available for transcription");
}
