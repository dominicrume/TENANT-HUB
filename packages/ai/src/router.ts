import { createOpenAI } from "@ai-sdk/openai";
import { createAzure } from "@ai-sdk/azure";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { LanguageModelV1 } from "ai";

export type AIBrainProvider = "openai" | "azure" | "claude" | "gemini" | "xai";

/**
 * Returns the correct Vercel AI SDK language model instance based on the selected provider.
 */
export function getBrainModel(provider: AIBrainProvider): LanguageModelV1 {
  switch (provider) {
    case "azure": {
      const azure = createAzure({
        resourceName: process.env.AZURE_RESOURCE_NAME,
        apiKey: process.env.AZURE_API_KEY,
      });
      // Assuming 'gpt-4o' or 'gpt-4' is deployed on the Azure instance. 
      // The deployment name must match the model string.
      return azure("gpt-4o"); 
    }
    case "openai": {
      const openai = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      return openai("gpt-4o");
    }
    case "claude": {
      const anthropic = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      return anthropic("claude-3-5-sonnet-20240620");
    }
    case "gemini": {
      const google = createGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
      });
      return google("models/gemini-1.5-pro-latest");
    }
    case "xai": {
      // xAI provides an OpenAI-compatible API endpoint
      const xai = createOpenAI({
        baseURL: "https://api.x.ai/v1",
        apiKey: process.env.XAI_API_KEY,
      });
      return xai("grok-beta"); // or "grok-2" depending on their current endpoints
    }
    default:
      throw new Error(`Unsupported AI Brain Provider: ${provider}`);
  }
}
