import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { withRouteHandler } from "../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/financials — the money, the way a managing agent reads it
 * (Matloob, 2026-10-14 "add financials"): the rent roll (what every active
 * tenancy should bring in, normalised to a month), this month's charged
 * and collected, what's owed, and all of it broken down by landlord and by
 * property. Everything is derived from service_charges, rent_payments and
 * tenancies — one data path (H7), nothing stored twice.
 */
export const GET = withRouteHandler({ resource: "rent", action: "read" }, async (_req, _ctx, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const org = auth.actor.org_id;
  try {
    const monthStart = new Date(); monthStart.setDate(1);
    const ms = monthStart.toISOString().slice(0, 10);

    const [roll, month, balances, byProperty, recent] = await Promise.all([
      // Rent roll: active tenancies → monthly equivalent.
      db().query<{ tenancy_id: string; tenant_id: string; full_name: string; rent_amount: string; rent_frequency: string; property_id: string; property: string; unit: string; landlord_id: string | null; landlord: string | null }>(
        `SELECT t.id AS tenancy_id, t.tenant_id, tn.full_name, t.rent_amount, t.rent_frequency, p.id AS property_id, p.name AS property, u.reference AS unit, p.landlord_id, l.name AS landlord
         FROM tenancies t JOIN tenants tn ON tn.id = t.tenant_id JOIN units u ON u.id = t.unit_id JOIN properties p ON p.id = u.property_id LEFT JOIN landlords l ON l.id = p.landlord_id
         WHERE t.org_id = $1 AND t.status = 'active' AND tn.is_archived = false`, [org]),
      db().query<{ charged: string; paid: string }>(
        `SELECT (SELECT COALESCE(sum(sc.amount),0) FROM service_charges sc JOIN tenants t ON t.id = sc.tenant_id WHERE t.org_id = $1 AND t.is_archived = false AND sc.due_date >= $2::date) AS charged,
                (SELECT COALESCE(sum(rp.amount),0) FROM rent_payments rp JOIN tenants t ON t.id = rp.tenant_id WHERE t.org_id = $1 AND t.is_archived = false AND rp.payment_date >= $2::date) AS paid`, [org, ms]),
      db().query<{ tenant_id: string; full_name: string; room_number: string | null; total_charged: string; total_paid: string; balance: string }>(
        `SELECT b.tenant_id, t.full_name, t.room_number, b.total_charged, b.total_paid, b.balance FROM tenant_arrears_balance b JOIN tenants t ON t.id = b.tenant_id WHERE b.org_id = $1 AND t.is_active = true AND t.is_archived = false ORDER BY b.balance ASC`, [org]),
      db().query<{ property_id: string; property: string; landlord_id: string | null; landlord: string | null; tenants: string; charged: string; paid: string }>(
        `SELECT p.id AS property_id, p.name AS property, p.landlord_id, l.name AS landlord,
                count(DISTINCT t.tenant_id) AS tenants,
                COALESCE((SELECT sum(sc.amount) FROM service_charges sc WHERE sc.tenant_id IN (SELECT tenant_id FROM tenancies tt JOIN units uu ON uu.id = tt.unit_id WHERE uu.property_id = p.id)), 0) AS charged,
                COALESCE((SELECT sum(rp.amount) FROM rent_payments rp WHERE rp.tenant_id IN (SELECT tenant_id FROM tenancies tt JOIN units uu ON uu.id = tt.unit_id WHERE uu.property_id = p.id)), 0) AS paid
         FROM properties p LEFT JOIN landlords l ON l.id = p.landlord_id
         LEFT JOIN units u ON u.property_id = p.id LEFT JOIN tenancies t ON t.unit_id = u.id AND t.status = 'active'
         WHERE p.org_id = $1 GROUP BY p.id, p.name, p.landlord_id, l.name ORDER BY l.name NULLS LAST, p.name`, [org]),
      db().query<{ id: string; amount: string; payment_type: string; payment_date: string; full_name: string; tenant_id: string }>(
        `SELECT rp.id, rp.amount, rp.payment_type, rp.payment_date, t.full_name, t.id AS tenant_id FROM rent_payments rp JOIN tenants t ON t.id = rp.tenant_id WHERE t.org_id = $1 AND t.is_archived = false ORDER BY rp.payment_date DESC, rp.created_at DESC LIMIT 15`, [org]),
    ]);

    const monthly = (amount: number, freq: string) => freq === "weekly" ? amount * 52 / 12 : freq === "fortnightly" ? amount * 26 / 12 : freq === "four_weekly" || freq === "4-weekly" ? amount * 13 / 12 : freq === "annual" || freq === "yearly" ? amount / 12 : amount;
    const rentRoll = roll.rows.map((r) => ({ ...r, rent_amount: Number(r.rent_amount), monthly: monthly(Number(r.rent_amount), r.rent_frequency) }));
    const rentRollMonthly = rentRoll.reduce((s, r) => s + r.monthly, 0);

    const byLandlordMap = new Map<string, { landlordId: string | null; landlord: string; properties: number; tenants: number; monthlyRoll: number; charged: number; paid: number }>();
    for (const p of byProperty.rows) {
      const k = p.landlord_id ?? "none";
      const cur = byLandlordMap.get(k) ?? { landlordId: p.landlord_id, landlord: p.landlord ?? "Landlord not set", properties: 0, tenants: 0, monthlyRoll: 0, charged: 0, paid: 0 };
      cur.properties += 1; cur.tenants += Number(p.tenants); cur.charged += Number(p.charged); cur.paid += Number(p.paid);
      cur.monthlyRoll += rentRoll.filter((r) => r.property_id === p.property_id).reduce((s, r) => s + r.monthly, 0);
      byLandlordMap.set(k, cur);
    }
    const arrears = balances.rows.filter((b) => Number(b.balance) < 0).map((b) => ({ tenantId: b.tenant_id, name: b.full_name, room: b.room_number, owed: -Number(b.balance) }));

    return NextResponse.json({
      monthStart: ms,
      totals: {
        rentRollMonthly, activeTenancies: rentRoll.length,
        monthCharged: Number(month.rows[0]?.charged ?? 0), monthPaid: Number(month.rows[0]?.paid ?? 0),
        owed: arrears.reduce((s, a) => s + a.owed, 0), inArrears: arrears.length,
        allTimeCharged: balances.rows.reduce((s, b) => s + Number(b.total_charged), 0), allTimePaid: balances.rows.reduce((s, b) => s + Number(b.total_paid), 0),
      },
      byLandlord: [...byLandlordMap.values()],
      byProperty: byProperty.rows.map((p) => ({ propertyId: p.property_id, property: p.property, landlord: p.landlord ?? "Landlord not set", tenants: Number(p.tenants), monthlyRoll: rentRoll.filter((r) => r.property_id === p.property_id).reduce((s, r) => s + r.monthly, 0), charged: Number(p.charged), paid: Number(p.paid), balance: Number(p.paid) - Number(p.charged) })),
      arrears,
      rentRoll,
      recentPayments: recent.rows.map((r) => ({ ...r, amount: Number(r.amount) })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[financials:GET]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
