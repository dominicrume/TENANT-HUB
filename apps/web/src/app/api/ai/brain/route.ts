import { NextRequest } from "next/server";
import { streamText, Message } from "ai";
import { getBrainModel, AIBrainProvider } from "@tenant-hub/ai";
import { createSupabaseServer } from "../../../../lib/supabase-server";

export const maxDuration = 60; // Set max duration for Edge/Serverless functions if needed

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { messages, provider } = await req.json() as { messages: Message[], provider: AIBrainProvider };
    
    if (!provider) {
      return new Response("Provider is required", { status: 400 });
    }

    const model = getBrainModel(provider);
    
    const result = await streamText({
      model,
      messages,
      system: "You are the Tenant Hub AI Brain, a powerful assistant for housing managers and support workers. You can analyze tenant profiles, assess risk, generate reports, and assist with general inquiries regarding supported housing operations. You should always be concise, professional, and helpful.",
    });

    return result.toDataStreamResponse();
  } catch (error: any) {
    console.error("AI Brain error:", error);
    return new Response(error.message || "Failed to generate AI response", { status: 500 });
  }
}
