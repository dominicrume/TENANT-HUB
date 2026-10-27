import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../../lib/safe-error";
import { isTenantInScope } from "../../../../../lib/landlord-scope";

export const dynamic = "force-dynamic";

/**
 * GET /api/tenants/[id]/signup-context — everything the sign-up forms are
 * filled from: the tenant's own details (the "initial form" every new
 * tenant completes), the room, the property, the rent and the landlord. One
 * read; the forms never ask for any of it twice (Matloob, 2026-10-15: "the
 * AI autofills from the initial form… I just give him to sign").
 */
export const GET = withRouteHandler({ resource: "tenants", action: "read" }, async (_req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  try {
    // Landlord-scope: a wrong-landlord URL poke must not reveal the tenant exists elsewhere.
    const inScope = await isTenantInScope((sql, p) => db().query(sql, p), auth, params.id);
    if (!inScope) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    const t = (await db().query(
      `SELECT id, title, full_name, dob, nino, nationality, mobile, email, address, postcode, room_number, moved_in, benefit_type, benefit_frequency, benefit_amount,
              nok_name, nok_relationship, nok_phone, hb_reference_number, referral_source
       FROM tenants WHERE id = $1 AND org_id = $2`, [params.id, auth.actor.org_id])).rows[0] as Record<string, unknown> | undefined;
    if (!t) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    const ty = (await db().query<{ rent_amount: string; rent_frequency: string; start_date: string | null; unit: string; property: string; address_line1: string | null; city: string | null; postcode: string | null; landlord: string | null; landlord_email: string | null; landlord_phone: string | null }>(
      `SELECT ty.rent_amount, ty.rent_frequency, ty.start_date::text, u.reference AS unit, p.name AS property, p.address_line1, p.city, p.postcode, l.name AS landlord, l.contact_email AS landlord_email, l.contact_phone AS landlord_phone
       FROM tenancies ty JOIN units u ON u.id = ty.unit_id JOIN properties p ON p.id = u.property_id LEFT JOIN landlords l ON l.id = p.landlord_id
       WHERE ty.tenant_id = $1 AND ty.status = 'active' ORDER BY ty.created_at DESC LIMIT 1`, [params.id])).rows[0] ?? null;
    const org = (await db().query<{ name: string }>("SELECT name FROM organisations WHERE id = $1", [auth.actor.org_id])).rows[0]?.name ?? "";
    return NextResponse.json({
      tenant: t,
      tenancy: ty ? { rent: Number(ty.rent_amount), frequency: ty.rent_frequency, startDate: ty.start_date, unit: ty.unit, property: ty.property, propertyAddress: [ty.address_line1 || ty.property, ty.city, ty.postcode].filter(Boolean).join(", ") } : null,
      landlord: ty?.landlord ? { name: ty.landlord, email: ty.landlord_email, phone: ty.landlord_phone } : null,
      organisation: org,
      staff: auth.actor.user_name,
      today: new Date().toISOString().slice(0, 10),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
