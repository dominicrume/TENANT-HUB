import { NextResponse } from "next/server";
import { complete, transcribe, activeProvider } from "@tenant-hub/ai";
import { getApiAuth } from "../../../../lib/api-auth";

/**
 * POST /api/intake/voice — extract tenant fields from a voice recording.
 * Body: FormData containing an 'audio' file.
 * Uses OpenAI Whisper (via transcribe) to convert speech to text,
 * then uses the text completion to extract CanonicalTenant fields.
 */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (activeProvider() === "none" || !process.env["OPENAI_API_KEY"]) {
    return NextResponse.json({ extracted: {}, confidence: {}, note: "No AI provider configured for voice" });
  }

  try {
    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ extracted: {}, confidence: {}, note: "No form data supplied" });
    }

    const audioFile = formData.get("audio") as File | null;
    if (!audioFile) {
      return NextResponse.json({ extracted: {}, confidence: {}, note: "No audio file supplied" });
    }

    // 1. Transcribe the audio
    const transcript = await transcribe(audioFile);
    if (!transcript) {
      return NextResponse.json({ extracted: {}, confidence: {}, note: "Failed to transcribe audio" });
    }

    // 2. Extract structured data from transcript
    const prompt = `You are extracting fields from a UK supported-housing voice intake transcript.
From the provided transcript, return ONLY a JSON object with any of these keys you can find:
title, full_name, dob (YYYY-MM-DD), nino, nationality, date_entry_uk, address, postcode,
room_number, moved_in (YYYY-MM-DD), mobile, email, languages, benefit_type, benefit_frequency,
benefit_amount (number), nok_name, nok_relationship, nok_phone, nok_address, doctor, probation_officer.
Omit keys you cannot find. No commentary.

TRANSCRIPT:
"${transcript}"`;

    const raw = await complete({ prompt, maxTokens: 700 });
    const json = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const extracted = JSON.parse(json) as Record<string, unknown>;
    const confidence = Object.fromEntries(Object.keys(extracted).map((k) => [k, "high"]));
    
    return NextResponse.json({ extracted, confidence, transcript });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Voice extraction failed";
    return NextResponse.json({ extracted: {}, confidence: {}, error: message }, { status: 200 });
  }
}
