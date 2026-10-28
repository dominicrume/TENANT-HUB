import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { getApiAuth } from "../../../../lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/intake/check-duplicates — the pre-advance check that stops a staff
 * member filling in a whole intake only to have commit refuse at the end.
 *
 * Changes in 107 / B1+B2:
 *   · Now also checks EMAIL (was NINO + mobile only). Rule from Rume: "like
 *     putting an email that's been taken in a database that you are
 *     registering it, it would automatically reject it".
 *   · Response NO LONGER names the matching tenant. Previously:
 *       "Duplicate NINO: already exists for tenant John Smith"
 *     Any logged-in user could enumerate names by guessing NINOs. GDPR issue.
 *     Now:
 *       "That NINO is already on file for another tenant."
 *   · Narrows the SELECT to is_archived = false AND is_active = true, matching
 *     every other duplicate-safe path in the codebase. Previously a returning
 *     tenant (archived) was blocked as a duplicate with no path forward.
 */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ duplicates: {} });

  const body = await req.json().catch(() => ({}));
  const nino = typeof body.nino === "string" ? body.nino.trim() : "";
  const mobile = typeof body.mobile === "string" ? body.mobile.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  const duplicates: Record<string, string> = {};
  const scope = "AND is_archived = false AND is_active = true";

  if (nino) {
    const r = await db().query<{ id: string }>(
      `SELECT id FROM tenants WHERE org_id = $1 AND nino = $2 ${scope} LIMIT 1`,
      [auth.actor.org_id, nino]);
    if (r.rows.length > 0) duplicates.nino = "That NINO is already on file for another tenant.";
  }

  if (mobile) {
    const r = await db().query<{ id: string }>(
      `SELECT id FROM tenants WHERE org_id = $1 AND mobile = $2 ${scope} LIMIT 1`,
      [auth.actor.org_id, mobile]);
    if (r.rows.length > 0) duplicates.mobile = "That mobile number is already on file for another tenant.";
  }

  if (email) {
    const r = await db().query<{ id: string }>(
      `SELECT id FROM tenants WHERE org_id = $1 AND lower(email) = $2 ${scope} LIMIT 1`,
      [auth.actor.org_id, email]);
    if (r.rows.length > 0) duplicates.email = "That email is already on file for another tenant.";
  }

  return NextResponse.json({ duplicates });
}
