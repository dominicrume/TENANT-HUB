import { NextResponse } from "next/server";
import { db } from "@tenant-hub/db";
import { ARREARS_LADDER, stageIndex } from "@tenant-hub/domain";
import type { UnitClass } from "@tenant-hub/validation";
import { withRouteHandler } from "../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

interface TenantRow { id: string; full_name: string; room_number: string | null; is_active: boolean | null; is_archived: boolean | null; housing_benefit_status: string | null }
interface TenancyRow { id: string; tenant_id: string; unit_id: string; status: string }
interface UnitRow { id: string; unit_class: UnitClass }
interface CaseRow { id: string; tenant_id: string; stage: string; opened_on: string }
interface ArrearsRow { tenant_id: string; balance: string | number; oldest_unpaid: string | null }
interface UnmatchedRow { id: string; tenant_id: string | null; amount: string | number; received_on: string; external_reference: string | null; confidence: string | number; is_simulated: boolean }

const HB_LINE: Record<string, string> = {
  suspended: "housing benefit is suspended, rent is not coming in",
  in_progress: "housing benefit is still pending",
  active: "housing benefit is active",
};

/**
 * GET /api/rent/summary — the Rent screen's one call: every open arrears
 * ladder drawn as beads with a plain-words "why", the bank transactions too
 * weak to mark paid on their own ("Is this rent?"), and who is simply up to
 * date. Built from the same tables the agents already write —
 * arrears-ladder's cases/events, rent-reconciliation's rent_unmatched,
 * tenancy_arrears — never a second, hand-rolled arrears calculation.
 */
export const GET = withRouteHandler({ resource: "rent", action: "read" }, async (_req, _ctx, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ ladders: [], isThisRent: [], upToDate: [] }, { headers: { "Cache-Control": "no-store" } });
  const orgId = auth.actor.org_id;

  let tenants, tenancies, units, cases, arrears, unmatched;
  try {
    [tenants, tenancies, units, cases, arrears, unmatched] = await Promise.all([
      db().query<TenantRow>("SELECT id, full_name, room_number, is_active, is_archived, housing_benefit_status FROM tenants WHERE org_id = $1", [orgId]),
      db().query<TenancyRow>("SELECT id, tenant_id, unit_id, status FROM tenancies WHERE org_id = $1 AND status = 'active'", [orgId]),
      db().query<UnitRow>("SELECT id, unit_class FROM units WHERE org_id = $1", [orgId]),
      db().query<CaseRow>("SELECT id, tenant_id, stage, opened_on FROM arrears_cases WHERE org_id = $1 AND closed_on IS NULL", [orgId]),
      db().query<ArrearsRow>("SELECT tenant_id, balance, oldest_unpaid::text FROM tenancy_arrears WHERE org_id = $1", [orgId]),
      db().query<UnmatchedRow>("SELECT id, tenant_id, amount, received_on, external_reference, confidence, is_simulated FROM rent_unmatched WHERE org_id = $1 AND status = 'pending'", [orgId]),
    ]);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }

  const tenantById = new Map(tenants.rows.map((t) => [t.id, t]));
  const unitClassById = new Map(units.rows.map((u) => [u.id, u.unit_class]));
  const unitClassByTenant = new Map(tenancies.rows.map((t) => [t.tenant_id, unitClassById.get(t.unit_id) ?? "supported"]));
  const arrearsByTenant = new Map(arrears.rows.map((a) => [a.tenant_id, a]));

  const today = new Date();
  const ladders = cases.rows
    .map((c) => {
      const tenant = tenantById.get(c.tenant_id);
      if (!tenant) return null;
      const unitClass = unitClassByTenant.get(c.tenant_id) ?? "supported";
      const rungs = ARREARS_LADDER[unitClass];
      const idx = stageIndex(unitClass, c.stage);
      const arrear = arrearsByTenant.get(c.tenant_id);
      const balance = arrear ? Number(arrear.balance) : null;
      const days = arrear?.oldest_unpaid ? Math.floor((today.getTime() - new Date(arrear.oldest_unpaid).getTime()) / 864e5) : null;
      const hbLine = tenant.housing_benefit_status ? HB_LINE[tenant.housing_benefit_status] : null;
      const why = [
        days != null ? `${days} day${days === 1 ? "" : "s"} overdue` : null,
        balance != null && balance > 0 ? `£${balance.toFixed(2)} owed` : null,
        hbLine,
      ].filter(Boolean).join(" · ") || "opened by the arrears ladder";
      return {
        tenantId: c.tenant_id, tenantName: tenant.full_name, roomNumber: tenant.room_number,
        unitClass, stage: c.stage, stageIndex: idx, rungs: rungs.map((r) => ({ stage: r.stage, label: r.label })),
        balance, hbStatus: tenant.housing_benefit_status, why,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const laddered = new Set(ladders.map((l) => l.tenantId));
  const isThisRent = unmatched.rows.map((u) => ({
    ...u, amount: Number(u.amount), confidence: Number(u.confidence), tenantName: u.tenant_id ? tenantById.get(u.tenant_id)?.full_name ?? null : null,
  }));

  const upToDate = tenancies.rows
    .map((t) => tenantById.get(t.tenant_id))
    .filter((t): t is TenantRow => t !== undefined && t.is_active !== false && !t.is_archived)
    .filter((t) => !laddered.has(t.id) && Number(arrearsByTenant.get(t.id)?.balance ?? 0) <= 0)
    .map((t) => ({ tenantId: t.id, tenantName: t.full_name, roomNumber: t.room_number, hbStatus: t.housing_benefit_status }));

  return NextResponse.json({ ladders, isThisRent, upToDate }, { headers: { "Cache-Control": "no-store" } });
});
