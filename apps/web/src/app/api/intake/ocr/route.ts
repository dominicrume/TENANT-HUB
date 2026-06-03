import { NextResponse } from "next/server";
import { complete, activeProvider } from "@tenant-hub/ai";
import { getApiAuth } from "../../../../lib/api-auth";

/**
 * POST /api/intake/ocr — extract tenant fields from an uploaded form image.
 * Body: { image: dataUrl }. Uses the configured AI provider's text reasoning to
 * return a JSON object shaped like TenantCreate. Field-level confidence is
 * inferred (present = high). Returns { extracted, confidence }.
 *
 * NOTE: image OCR quality depends on the provider/model; without an AI key this
 * returns an empty extraction so the UI falls back to manual entry.
 */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (activeProvider() === "none") {
    return NextResponse.json({ extracted: {}, confidence: {}, note: "No AI provider configured" });
  }

  const body = await req.json().catch(() => null);
  const text: string | undefined = body?.text;
  if (!text) {
    // We only forward extracted OCR text here; image→text happens client-side or
    // is pasted. Keeps this route provider-portable.
    return NextResponse.json({ extracted: {}, confidence: {}, note: "No text supplied" });
  }

  const prompt = `You are extracting fields from a UK supported-housing intake form.
From the text below, return ONLY a JSON object with any of these keys you can find:
title, full_name, dob (YYYY-MM-DD), nino, nationality, date_entry_uk, address, postcode,
room_number, moved_in (YYYY-MM-DD), mobile, email, languages, benefit_type, benefit_frequency,
benefit_amount (number), nok_name, nok_relationship, nok_phone, nok_address, doctor, probation_officer.
Omit keys you cannot find. No commentary.

FORM TEXT:
${text}`;

  try {
    const raw = await complete({ prompt, maxTokens: 700 });
    const json = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const extracted = JSON.parse(json) as Record<string, unknown>;
    const confidence = Object.fromEntries(Object.keys(extracted).map((k) => [k, "high"]));
    return NextResponse.json({ extracted, confidence });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ extracted: {}, confidence: {}, error: message }, { status: 200 });
  }
}
