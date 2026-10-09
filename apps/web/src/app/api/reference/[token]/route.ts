import { NextResponse } from "next/server";
import { db, findReferenceByTokenHash, respondToReference } from "@tenant-hub/db";
import { hashToken } from "@tenant-hub/auth";

export const dynamic = "force-dynamic";

/** Public: what the referee's link shows, and where their answer lands (migration 052). */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const ref = await findReferenceByTokenHash(db(), hashToken(params.token));
  if (!ref) return NextResponse.json({ error: "This reference link has expired or was already answered." }, { status: 410 });
  return NextResponse.json({ kind: ref.kind, refereeName: ref.refereeName, tenantFirstName: ref.tenantFirstName, orgName: ref.orgName, answered: ref.status !== "requested" }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const body = (await req.json().catch(() => null)) as { decision?: string; response?: string } | null;
  const decision = body?.decision;
  const response = typeof body?.response === "string" ? body.response.trim().slice(0, 4000) : "";
  if (decision !== "positive" && decision !== "negative" && decision !== "unable") return NextResponse.json({ error: "Choose one of the three options" }, { status: 422 });
  const ok = await respondToReference(db(), { tokenHash: hashToken(params.token), decision, response });
  if (!ok) return NextResponse.json({ error: "This reference link has expired or was already answered." }, { status: 410 });
  return NextResponse.json({ ok: true });
}
