import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { notifier } from "@tenant-hub/adapters";
import { env } from "@tenant-hub/env";
import { getApiAuth } from "../../../lib/api-auth";
import { isSameOriginPost } from "../../../lib/csrf";
import { toSafeErrorMessage } from "../../../lib/safe-error";

export const dynamic = "force-dynamic";

const KINDS = new Set(["question", "problem", "idea", "urgent"]);
const DEFAULT_SUPPORT_EMAIL = "dominicrume@gmail.com";

/**
 * Support (migration 060) — "support always should be there for me"
 * (Matloob, 2026-10-14). A message from inside the app, with who sent it,
 * which page they were on and which workspace; kept in the database and
 * emailed to the builders. GET lists this organisation's own messages.
 */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json([]);
  const r = await db().query("SELECT id, from_name, kind, subject, body, status, emailed, created_at FROM support_requests WHERE org_id = $1 ORDER BY created_at DESC LIMIT 50", [auth.actor.org_id]);
  return NextResponse.json(r.rows, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { kind?: string; subject?: string; body?: string; pageUrl?: string } | null;
  const kind = KINDS.has(body?.kind ?? "") ? body!.kind! : "question";
  const subject = typeof body?.subject === "string" ? body.subject.trim().slice(0, 160) : "";
  const text = typeof body?.body === "string" ? body.body.trim().slice(0, 4000) : "";
  if (!subject) return NextResponse.json({ error: "Give it a one-line subject" }, { status: 422 });
  if (!text) return NextResponse.json({ error: "Tell us what's happening" }, { status: 422 });
  try {
    const email = (await db().query<{ email: string | null }>("SELECT email FROM profiles WHERE id = $1", [auth.actor.user_id])).rows[0]?.email ?? null;
    const org = (await db().query<{ name: string }>("SELECT name FROM organisations WHERE id = $1", [auth.actor.org_id])).rows[0]?.name ?? "";
    let emailed = false;
    try {
      const res = await notifier().send({
        to: env.server.SUPPORT_EMAIL ?? DEFAULT_SUPPORT_EMAIL, channel: "email",
        subject: `[Tenant Hub support · ${kind.toUpperCase()}] ${subject} — ${auth.actor.user_name} (${org})`,
        body: `${text}\n\n—\nFrom: ${auth.actor.user_name} <${email ?? "no email"}> · ${auth.actor.user_role}\nWorkspace: ${org}\nPage: ${body?.pageUrl ?? "unknown"}\nWhen: ${new Date().toISOString()}`,
      });
      emailed = res.mode === "live" && res.data.delivered;
    } catch { emailed = false; }
    const { data } = await writeWithAudit({
      table: "support_requests",
      record: { org_id: auth.actor.org_id, profile_id: auth.actor.user_id, from_name: auth.actor.user_name, from_email: email, kind, subject, body: text, page_url: body?.pageUrl ?? null, emailed } as Record<string, unknown>,
      action: "CREATE", org_id: auth.actor.org_id, ...auth.actor,
    });
    return NextResponse.json({ ...(data as Record<string, unknown>), emailed }, { status: 201 });
  } catch (err) {
    console.error("[support:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
