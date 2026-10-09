import { NextResponse } from "next/server";
import { db, listReferences, insertReference, markReferenceNotified, type ReferenceKind } from "@tenant-hub/db";
import { generateToken, hashToken } from "@tenant-hub/auth";
import { withRouteHandler } from "../../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../../lib/safe-error";
import { sendReferenceRequest } from "../../../../../lib/resend";
import { publicOrigin } from "../../../../../lib/google-oauth";

export const dynamic = "force-dynamic";

const KINDS: ReferenceKind[] = ["previous_landlord", "employer", "support_worker", "character"];

/**
 * Tenant referencing (migration 052): ask a referee by email; they answer a
 * one-shot link. Sits beside the Right to Rent / ID check — that answers
 * "are they who they say", this answers "how did it go last time".
 */
export const GET = withRouteHandler({ resource: "tenants", action: "read" }, async (_req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json([]);
  const rows = await listReferences(db(), { orgId: auth.actor.org_id, tenantId: params.id });
  return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withRouteHandler({ resource: "tenants", action: "update" }, async (req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { kind?: string; refereeName?: string; refereeEmail?: string } | null;
  const kind = body?.kind as ReferenceKind;
  const refereeName = typeof body?.refereeName === "string" ? body.refereeName.trim() : "";
  const refereeEmail = typeof body?.refereeEmail === "string" ? body.refereeEmail.trim().toLowerCase() : "";
  if (!KINDS.includes(kind)) return NextResponse.json({ error: "Pick what kind of reference this is" }, { status: 422 });
  if (!refereeName) return NextResponse.json({ error: "Who are we asking? Enter their name." }, { status: 422 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(refereeEmail)) return NextResponse.json({ error: "Enter a valid email for the referee" }, { status: 422 });

  try {
    const tenant = await db().query<{ full_name: string; org_name: string }>(
      "SELECT t.full_name, o.name AS org_name FROM tenants t JOIN organisations o ON o.id = t.org_id WHERE t.id = $1 AND t.org_id = $2",
      [params.id, auth.actor.org_id]);
    const t = tenant.rows[0];
    if (!t) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const token = generateToken();
    const id = await insertReference(db(), { orgId: auth.actor.org_id, tenantId: params.id, kind, refereeName, refereeEmail, tokenHash: hashToken(token), requestedBy: auth.actor.user_name });
    const url = `${publicOrigin(req)}/reference/${token}`;
    const sent = await sendReferenceRequest(refereeEmail, refereeName, t.full_name.split(/\s+/)[0] ?? t.full_name, t.org_name, kind, url);
    if (sent) await markReferenceNotified(db(), id);
    // If email isn't configured the link itself is returned so staff can send
    // it by hand — the request is never silently stuck.
    return NextResponse.json({ id, notified: sent, url: sent ? undefined : url }, { status: 201 });
  } catch (err) {
    console.error("[references:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
