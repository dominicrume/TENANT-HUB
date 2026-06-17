import { NextResponse } from "next/server";
import { getApiAuth } from "../../../../lib/api-auth";
import { complete } from "@tenant-hub/ai";

export async function POST(req: Request) {
  try {
    const auth = await getApiAuth();
    if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    
    const body = await req.json();
    const { channel, messageType, recipientName } = body;
    
    if (!channel || !messageType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    
    const recipient = recipientName || "All Tenants";
    
    const prompt = `Write a professional, polite, and concise message to ${recipient} regarding a "${messageType}". 
This message will be sent via ${channel}. 
Keep it clear, supportive, and appropriate for a supported housing context.
${channel === "SMS" ? "Since this is an SMS, keep it strictly under 160 characters if possible and very direct." : "Since this is an Email, include a brief professional sign-off from 'Management'."}
Do not include subject lines, just the body of the message.`;

    const draft = await complete({
      prompt,
      system: "You are an expert supported housing manager. You write clear, empathetic, and professional communications to tenants.",
      maxTokens: 500
    });
    
    return NextResponse.json({ draft });
  } catch (error: any) {
    console.error("AI Draft Error:", error);
    return NextResponse.json(
      { error: "Failed to generate draft: " + error.message },
      { status: 500 }
    );
  }
}
