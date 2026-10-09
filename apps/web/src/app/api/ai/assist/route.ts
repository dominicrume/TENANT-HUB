import { NextResponse } from "next/server";
import { complete } from "@tenant-hub/ai";
import { getApiAuth } from "../../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

type Purpose = "handover" | "incident" | "session" | "staff_note";
type Action = "draft" | "tidy" | "shorten";

const PURPOSE: Record<Purpose, string> = {
  handover: "a shift handover note for the next member of staff coming on duty in a supported-housing HMO: who to watch, what's outstanding, what's changed. Short, plain, in order of importance.",
  incident: "an incident log entry for a supported-housing HMO. Just the facts, in the order they happened: what, who, when, what was done, what's still needed. No opinions, no blame, no speculation.",
  session: "a support-session note for a tenant's record in supported housing: what was discussed, what was agreed, any concerns, next step and date.",
  staff_note: "a private staff note on a tenant's record: a brief, factual observation other staff need to know.",
};

const ACTION: Record<Action, (text: string) => string> = {
  draft: (t) => `Write it from these rough notes (they may be bullet points, fragments or shorthand):\n\n${t}`,
  tidy: (t) => `Rewrite this so it reads clearly. Keep every fact exactly as given — add nothing, remove nothing, change no names, dates, amounts or times. Fix grammar and flow only:\n\n${t}`,
  shorten: (t) => `Shorten this to the essentials. Keep every fact that matters to the next person; drop padding only:\n\n${t}`,
};

/**
 * POST /api/ai/assist { purpose, action, text, context? } → { text }
 * The writing assistant on every free-text box (handover, incident, session,
 * staff note) — our own AI brain rather than a browser extension. Draft from
 * rough notes, tidy what's there, or shorten it. Never invents facts: the
 * system prompt forbids it and the UI says "read it before you post it".
 * Nothing is saved here — the result lands back in the textbox, and only
 * what the person then posts is recorded, under their name.
 */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { purpose?: Purpose; action?: Action; text?: string; context?: Record<string, string> } | null;
  const purpose = body?.purpose && PURPOSE[body.purpose] ? body.purpose : null;
  const action = body?.action && ACTION[body.action] ? body.action : null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!purpose || !action) return NextResponse.json({ error: "purpose and action are required" }, { status: 422 });
  if (!text) return NextResponse.json({ error: "Type a few words first — even bullet points — and the assistant will write from them." }, { status: 422 });
  if (text.length > 6000) return NextResponse.json({ error: "That's too long to rewrite in one go — split it up." }, { status: 413 });

  const ctx = Object.entries(body?.context ?? {}).filter(([, v]) => typeof v === "string" && v).map(([k, v]) => `${k}: ${v}`).join("; ");

  try {
    const out = await complete({
      system: `You help staff in UK supported housing write ${PURPOSE[purpose]} Write in UK English, first person plural or neutral, no headings, no markdown, no preamble — return only the note itself. Never invent names, dates, amounts or events that aren't in the input. Staff shorthand: HB = Housing Benefit, UC = Universal Credit, HMO = house in multiple occupation, SW = support worker, LL = landlord, EPC/EICR/gas cert = property certificates, R2R = right to rent, DWP = Department for Work and Pensions, HA = housing association. Expand shorthand only to these meanings; never guess at others. ${ctx ? `Context: ${ctx}.` : ""}`,
      prompt: ACTION[action](text),
      maxTokens: 500,
    });
    return NextResponse.json({ text: out.trim() });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err, "The assistant couldn't write that just now") }, { status: 502 });
  }
}
