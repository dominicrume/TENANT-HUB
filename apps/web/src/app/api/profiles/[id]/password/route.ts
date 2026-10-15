import { NextResponse } from "next/server";
import { db, writeWithAudit, activeCredential, findProfileById } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../../lib/api-handler";
import { isSameOriginPost } from "../../../../../lib/csrf";
import { canManageUsers } from "../../../../../lib/user-admin";
import { reissuePassword } from "../../../../../lib/issue-invite";
import { publicOrigin } from "../../../../../lib/google-oauth";
import { unseal, vaultOpen } from "../../../../../lib/vault";
import { toSafeErrorMessage } from "../../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/** GET /api/profiles/[id]/password — the admin reveals the password they issued (vault, counted, audited). */
export const GET = withRouteHandler({ resource: "sessions", action: "create" }, async (_req, { params }: { params: { id: string } }, auth) => {
  if (!(await canManageUsers(auth.actor))) return NextResponse.json({ error: "Only the organisation's admin can see issued passwords" }, { status: 403 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  if (!vaultOpen()) return NextResponse.json({ error: "The vault key isn't set on this environment" }, { status: 503 });
  try {
    const who = await findProfileById(db(), params.id);
    if (!who || who.org_id !== auth.actor.org_id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (who.role === "admin") return NextResponse.json({ error: "An admin's password is their own — it isn't in the vault" }, { status: 403 });
    const row = await activeCredential(db(), params.id);
    if (!row) return NextResponse.json({ error: "No issued password on record for this person — issue a new one.", none: true }, { status: 404 });
    const password = unseal(row);
    await writeWithAudit({ table: "issued_credentials", record: { id: row.id, reveal_count: row.reveal_count + 1, last_revealed_at: new Date().toISOString() } as Record<string, unknown>, action: "UPDATE", ...auth.actor });
    return NextResponse.json({ email: row.email, password, issuedBy: row.issued_by_name, issuedAt: row.issued_at, reveals: row.reveal_count + 1 }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) { return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 }); }
});

/** POST /api/profiles/[id]/password — issue a new password: old one dies everywhere, new one vaulted and handed back. */
export const POST = withRouteHandler({ resource: "sessions", action: "create" }, async (req, { params }: { params: { id: string } }, auth) => {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  if (!(await canManageUsers(auth.actor))) return NextResponse.json({ error: "Only the organisation's admin can issue passwords" }, { status: 403 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  try {
    const who = await findProfileById(db(), params.id);
    if (!who || who.org_id !== auth.actor.org_id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (who.id === auth.actor.user_id) return NextResponse.json({ error: "Change your own password under Security, not here" }, { status: 400 });
    if (who.role === "admin") return NextResponse.json({ error: "Another admin's password can't be issued from here" }, { status: 403 });
    const r = await reissuePassword({ profileId: who.id, email: who.email, role: who.role, orgId: auth.actor.org_id, origin: publicOrigin(req), actor: auth.actor });
    return NextResponse.json({ email: who.email, password: r.password, url: r.url, delivered: r.delivered, vaulted: r.vaulted });
  } catch (err) { return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 }); }
});
