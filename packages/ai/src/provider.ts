import { generateText } from "ai";
import { getBrainModel, AIBrainProvider } from "./router";
import OpenAI from "openai";

export interface CompleteOptions {
  prompt: string;
  system?: string;
  maxTokens?: number;
  image?: string; // base64 data url
  provider?: AIBrainProvider;
}

export function activeProvider(): string {
  if (process.env["AZURE_API_KEY"]) return "azure";
  if (process.env["OPENAI_API_KEY"]) return "openai";
  if (process.env["ANTHROPIC_API_KEY"]) return "anthropic";
  if (process.env["GEMINI_API_KEY"]) return "gemini";
  if (process.env["XAI_API_KEY"]) return "xai";
  if (process.env["RUNCRATE_API_KEY"]) return "runcrate";
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
