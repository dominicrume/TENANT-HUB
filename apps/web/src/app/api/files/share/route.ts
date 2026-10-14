import { NextResponse } from "next/server";
import { db, insertShare, listShares, revokeShare, blobBelongsToOrg } from "@tenant-hub/db";
import { generateToken, hashToken } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../lib/api-auth";
import { isSameOriginPost } from "../../../../lib/csrf";
import { publicOrigin } from "../../../../lib/google-oauth";
import { toSafeErrorMessage } from "../../../../lib/safe-error";
import { isUuid } from "../../../../lib/files-auth";

export const dynamic = "force-dynamic";

/**
 * Expiring share links (docs/FILES_SPEC.md §2.4): hand a file to someone
 * with no account — a landlord, a council officer, a solicitor — as a link
 * that stops working on a date, counts opens, and can be revoked. The token
 * is stored hashed, like every other link in the system.
 */
export async function POST(req: Request) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { blobId?: string; days?: number; label?: string } | null;
  const days = [1, 7, 30, 90].includes(Number(body?.days)) ? Number(body!.days) : 7;
  if (!isUuid(body?.blobId)) return NextResponse.json({ error: "blobId is required" }, { status: 400 });
  try {
    if (!(await blobBelongsToOrg(db(), { blobId: body!.blobId!, orgId: auth.actor.org_id }))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const token = generateToken();
    const id = await insertShare(db(), { orgId: auth.actor.org_id, blobId: body!.blobId!, tokenHash: hashToken(token), label: body?.label?.trim().slice(0, 120) || null, days, createdBy: auth.actor.user_name });
    return NextResponse.json({ id, url: `${publicOrigin(req)}/share/${token}`, expiresInDays: days }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json([]);
  const blobId = new URL(req.url).searchParams.get("blobId");
  return NextResponse.json(await listShares(db(), auth.actor.org_id, isUuid(blobId) ? blobId : undefined), { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const id = new URL(req.url).searchParams.get("id");
  if (!isUuid(id)) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await revokeShare(db(), { id, orgId: auth.actor.org_id });
  return NextResponse.json({ ok: true });
}
