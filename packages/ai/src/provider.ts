// `ai` and `./router` (which loads @ai-sdk/openai, @ai-sdk/azure, @ai-sdk/anthropic,
// @ai-sdk/google) are imported LAZILY inside complete(), not at module load time.
// Their dependency graph has a real transitive version conflict in this monorepo
// (zod-to-json-schema@3.25 expects a zod subpath export this repo's pinned
// zod@3.23 does not have). Next.js's webpack resolver tolerates it; plain Node
// ESM resolution — what the worker runs under via tsx, and what any test of
// this package runs under — does not. Importing @tenant-hub/ai at all must
// never eagerly trigger that failure; only an actual LLM call should.
import type { AIBrainProvider } from "./router";
import OpenAI from "openai";

export interface CompleteOptions {
  prompt: string;
  system?: string;
  maxTokens?: number;
  image?: string; // base64 data url
  provider?: AIBrainProvider;
}

// OpenAI only, for now (Rume, 2026-10-05) — other provider keys (Azure,
// Anthropic, Gemini, xAI, Runcrate) may exist in the environment but are
// deliberately ignored here rather than used as fallbacks.
export function activeProvider(): string {
  if (process.env["OPENAI_API_KEY"]) return "openai";
  return "none";
}

export async function complete(opts: CompleteOptions): Promise<string> {
  const maxTokens = opts.maxTokens ?? 1500;
  const errors: string[] = [];

  const providerId = opts.provider || activeProvider();

  if (providerId === "none") {
    throw new Error("No AI provider is configured. Please check your .env keys.");
  }

  const provider = providerId as AIBrainProvider;

  try {
    const { getBrainModel } = await import("./router");
    const { generateText } = await import("ai");
    const model = getBrainModel(provider);

    // Prepare content for vision or text
    let content: any = opts.prompt;
    if (opts.image) {
      const parts = opts.image.split(",");
      const data = parts[1] || "";
      content = [
        { type: "text", text: opts.prompt },
        { type: "image", image: data } // Vercel AI SDK format for base64
      ];
    }

    const res = await generateText({
      model,
      maxTokens,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [
        { role: "user", content }
      ],
    });

    return res.text;
  } catch (err: any) {
    const msg = `${provider} API failed: ${err?.message || "Unknown error"}`;
    console.warn(msg);
    errors.push(msg);
  }

  throw new Error(`AI completion failed: ${errors.join(" | ")}`);
}

export async function transcribe(audioFile: File | Blob): Promise<string> {
  if (process.env["OPENAI_API_KEY"]) {
    try {
      const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });
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
