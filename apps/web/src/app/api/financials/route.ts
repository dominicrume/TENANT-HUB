import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { withRouteHandler } from "../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../lib/safe-error";
import { landlordScope, activeLandlordId } from "../../../lib/landlord-scope";

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

    // Six months of history, for the trend sparkline.
    const trendStart = new Date(); trendStart.setMonth(trendStart.getMonth() - 5); trendStart.setDate(1);
    const ts = trendStart.toISOString().slice(0, 10);
    // Today's date, for aged receivables.
    const todayStr = new Date().toISOString().slice(0, 10);

    // Landlord-scope: every money line restricts to the active landlord's portfolio.
    // When the actor is in "All landlords" mode the fragments are empty strings and
    // the extra param is omitted — behaviour unchanged.
    const activeLord = activeLandlordId(auth);
    const scopeRoll = landlordScope(auth, "viaUnit", { col: "t.unit_id", paramIndex: 2 });
    const scopeMonthSc3 = landlordScope(auth, "viaTenant", { col: "sc.tenant_id", paramIndex: 3 });
    const scopeMonthRp3 = landlordScope(auth, "viaTenant", { col: "rp.tenant_id", paramIndex: 3 });
    const scopeBal2 = landlordScope(auth, "viaTenant", { col: "b.tenant_id", paramIndex: 2 });
    const scopePropsDirect2 = landlordScope(auth, "direct", { col: "p.landlord_id", paramIndex: 2 });
    const scopeRecent2 = landlordScope(auth, "viaTenant", { col: "rp.tenant_id", paramIndex: 2 });
    const scopePrevSc2 = landlordScope(auth, "viaTenant", { col: "sc.tenant_id", paramIndex: 2 });
    const scopePrevRp2 = landlordScope(auth, "viaTenant", { col: "rp.tenant_id", paramIndex: 2 });

    const [roll, month, balances, byProperty, recent, aged, trend, prevMonth] = await Promise.all([
      // Rent roll: active tenancies → monthly equivalent.
      db().query<{ tenancy_id: string; tenant_id: string; full_name: string; rent_amount: string; rent_frequency: string; property_id: string; property: string; unit: string; landlord_id: string | null; landlord: string | null }>(
        `SELECT t.id AS tenancy_id, t.tenant_id, tn.full_name, t.rent_amount, t.rent_frequency, p.id AS property_id, p.name AS property, u.reference AS unit, p.landlord_id, l.name AS landlord
         FROM tenancies t JOIN tenants tn ON tn.id = t.tenant_id JOIN units u ON u.id = t.unit_id JOIN properties p ON p.id = u.property_id LEFT JOIN landlords l ON l.id = p.landlord_id
         WHERE t.org_id = $1 AND t.status = 'active' AND tn.is_archived = false${scopeRoll.sql}`, [org, ...scopeRoll.params]),
      db().query<{ charged: string; paid: string }>(
        `SELECT (SELECT COALESCE(sum(sc.amount),0) FROM service_charges sc JOIN tenants t ON t.id = sc.tenant_id WHERE t.org_id = $1 AND t.is_archived = false AND sc.due_date >= $2::date${scopeMonthSc3.sql}) AS charged,
                (SELECT COALESCE(sum(rp.amount),0) FROM rent_payments rp JOIN tenants t ON t.id = rp.tenant_id WHERE t.org_id = $1 AND t.is_archived = false AND rp.payment_date >= $2::date${scopeMonthRp3.sql}) AS paid`, activeLord ? [org, ms, activeLord] : [org, ms]),
      db().query<{ tenant_id: string; full_name: string; room_number: string | null; total_charged: string; total_paid: string; balance: string }>(
        `SELECT b.tenant_id, t.full_name, t.room_number, b.total_charged, b.total_paid, b.balance FROM tenant_arrears_balance b JOIN tenants t ON t.id = b.tenant_id WHERE b.org_id = $1 AND t.is_active = true AND t.is_archived = false${scopeBal2.sql} ORDER BY b.balance ASC`, activeLord ? [org, activeLord] : [org]),
      db().query<{ property_id: string; property: string; landlord_id: string | null; landlord: string | null; tenants: string; charged: string; paid: string }>(
        `SELECT p.id AS property_id, p.name AS property, p.landlord_id, l.name AS landlord,
                count(DISTINCT t.tenant_id) AS tenants,
                COALESCE((SELECT sum(sc.amount) FROM service_charges sc WHERE sc.tenant_id IN (SELECT tenant_id FROM tenancies tt JOIN units uu ON uu.id = tt.unit_id WHERE uu.property_id = p.id)), 0) AS charged,
                COALESCE((SELECT sum(rp.amount) FROM rent_payments rp WHERE rp.tenant_id IN (SELECT tenant_id FROM tenancies tt JOIN units uu ON uu.id = tt.unit_id WHERE uu.property_id = p.id)), 0) AS paid
         FROM properties p LEFT JOIN landlords l ON l.id = p.landlord_id
         LEFT JOIN units u ON u.property_id = p.id LEFT JOIN tenancies t ON t.unit_id = u.id AND t.status = 'active'
         WHERE p.org_id = $1${scopePropsDirect2.sql} GROUP BY p.id, p.name, p.landlord_id, l.name ORDER BY l.name NULLS LAST, p.name`, activeLord ? [org, activeLord] : [org]),
      db().query<{ id: string; amount: string; payment_type: string; payment_date: string; full_name: string; tenant_id: string }>(
        `SELECT rp.id, rp.amount, rp.payment_type, rp.payment_date, t.full_name, t.id AS tenant_id FROM rent_payments rp JOIN tenants t ON t.id = rp.tenant_id WHERE t.org_id = $1 AND t.is_archived = false${scopeRecent2.sql} ORDER BY rp.payment_date DESC, rp.created_at DESC LIMIT 15`, activeLord ? [org, activeLord] : [org]),
      // Aged receivables: unpaid service charges bucketed by how long they've been overdue — the view an accountant expects.
      db().query<{ bucket: string; amount: string; count: string }>(
        `SELECT
           CASE
             WHEN sc.due_date >= ($2::date - INTERVAL '30 days') THEN '0-30'
             WHEN sc.due_date >= ($2::date - INTERVAL '60 days') THEN '31-60'
             WHEN sc.due_date >= ($2::date - INTERVAL '90 days') THEN '61-90'
             ELSE '90+'
           END AS bucket,
           SUM(sc.amount) AS amount,
           COUNT(*) AS count
         FROM service_charges sc JOIN tenants t ON t.id = sc.tenant_id
         WHERE t.org_id = $1 AND t.is_archived = false AND sc.is_paid = false AND sc.due_date <= $2::date${scopeMonthSc3.sql}
         GROUP BY bucket`, activeLord ? [org, todayStr, activeLord] : [org, todayStr]),
      // 6-month trend: charged and paid per month, so the sparkline reads real history.
      db().query<{ month: string; charged: string; paid: string }>(
        `WITH months AS (
           SELECT generate_series($2::date, (CURRENT_DATE)::date, INTERVAL '1 month')::date AS m
         )
         SELECT TO_CHAR(months.m, 'YYYY-MM') AS month,
                COALESCE((SELECT SUM(sc.amount) FROM service_charges sc JOIN tenants t ON t.id = sc.tenant_id WHERE t.org_id = $1 AND t.is_archived = false AND date_trunc('month', sc.due_date) = date_trunc('month', months.m)${scopeMonthSc3.sql}), 0) AS charged,
                COALESCE((SELECT SUM(rp.amount) FROM rent_payments rp JOIN tenants t ON t.id = rp.tenant_id WHERE t.org_id = $1 AND t.is_archived = false AND date_trunc('month', rp.payment_date) = date_trunc('month', months.m)${scopeMonthRp3.sql}), 0) AS paid
         FROM months ORDER BY months.m`, activeLord ? [org, ts, activeLord] : [org, ts]),
      // Last calendar month's totals so the four KPIs can show a trend chip (↑ 12% / ↓ 8%).
      db().query<{ charged: string; paid: string }>(
        `WITH prev AS (
           SELECT date_trunc('month', CURRENT_DATE - INTERVAL '1 month')::date AS first,
                  (date_trunc('month', CURRENT_DATE))::date AS next
         )
         SELECT (SELECT COALESCE(SUM(sc.amount),0) FROM service_charges sc JOIN tenants t ON t.id = sc.tenant_id, prev WHERE t.org_id = $1 AND t.is_archived = false AND sc.due_date >= prev.first AND sc.due_date < prev.next${scopePrevSc2.sql}) AS charged,
                (SELECT COALESCE(SUM(rp.amount),0) FROM rent_payments  rp JOIN tenants t ON t.id = rp.tenant_id,  prev WHERE t.org_id = $1 AND t.is_archived = false AND rp.payment_date >= prev.first AND rp.payment_date < prev.next${scopePrevRp2.sql}) AS paid`, activeLord ? [org, activeLord] : [org]),
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

    // Aged receivables as the four buckets a managing agent reads (0-30 / 31-60 / 61-90 / 90+).
    const buckets = { "0-30": { amount: 0, count: 0 }, "31-60": { amount: 0, count: 0 }, "61-90": { amount: 0, count: 0 }, "90+": { amount: 0, count: 0 } };
    for (const row of aged.rows) if (row.bucket in buckets) { buckets[row.bucket as keyof typeof buckets] = { amount: Number(row.amount), count: Number(row.count) }; }

    const prev = { charged: Number(prevMonth.rows[0]?.charged ?? 0), paid: Number(prevMonth.rows[0]?.paid ?? 0) };
    const monthCharged = Number(month.rows[0]?.charged ?? 0); const monthPaid = Number(month.rows[0]?.paid ?? 0);

    return NextResponse.json({
      monthStart: ms,
      totals: {
        rentRollMonthly, activeTenancies: rentRoll.length,
        monthCharged, monthPaid,
        owed: arrears.reduce((s, a) => s + a.owed, 0), inArrears: arrears.length,
        allTimeCharged: balances.rows.reduce((s, b) => s + Number(b.total_charged), 0), allTimePaid: balances.rows.reduce((s, b) => s + Number(b.total_paid), 0),
        prevMonthCharged: prev.charged, prevMonthPaid: prev.paid,
        collectionRatePct: monthCharged > 0 ? Math.round((monthPaid / monthCharged) * 100) : null,
      },
      agedReceivables: buckets,
      trend: trend.rows.map((r) => ({ month: r.month, charged: Number(r.charged), paid: Number(r.paid) })),
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
