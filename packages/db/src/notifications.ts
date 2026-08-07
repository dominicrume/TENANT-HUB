/**
 * Read models for the daily-notifications cron.
 *
 * These run with the service-role client because the cron has no user context
 * and must see across every organisation. That is exactly why the queries live
 * HERE and not in apps/web: H2 requires the service-role client stay inside
 * packages/db. Callers get plain data back and never touch the client.
 */
import { adminClient } from "./client";

export interface DueServiceCharge {
  amount: number;
  dueDate: string;
  tenantName: string;
  tenantEmail: string;
}

export interface UpcomingSession {
  sessionDate: string;
  tenantName: string;
  tenantEmail: string;
}

export interface HousingBenefitAlert {
  managerName: string;
  managerEmail: string;
  tenants: { name: string; status: string }[];
}

/** Joined tenant shape as returned by PostgREST — always arrives as an object here. */
type JoinedTenant = { full_name: string | null; email: string | null } | null;

/** Unpaid service charges falling due on the given ISO date (YYYY-MM-DD). */
export async function getServiceChargesDueOn(dueDate: string): Promise<DueServiceCharge[]> {
  const { data, error } = await adminClient
    .from("service_charges")
    .select("amount, due_date, week_label, tenants(full_name, email)")
    .eq("is_paid", false)
    .eq("due_date", dueDate);

  if (error) throw new Error(`Service charges query failed: ${error.message}`);

  return (data ?? []).flatMap((row) => {
    const tenant = row.tenants as unknown as JoinedTenant;
    if (!tenant?.email) return [];
    return [
      {
        amount: Number(row.amount),
        dueDate: row.due_date as string,
        tenantName: tenant.full_name ?? "",
        tenantEmail: tenant.email,
      },
    ];
  });
}

/** Support sessions scheduled for the given ISO date (YYYY-MM-DD). */
export async function getSessionsOn(sessionDate: string): Promise<UpcomingSession[]> {
  const { data, error } = await adminClient
    .from("sessions")
    .select("session_date, tenants(full_name, email)")
    .eq("session_date", sessionDate);

  if (error) throw new Error(`Sessions query failed: ${error.message}`);

  return (data ?? []).flatMap((row) => {
    const tenant = row.tenants as unknown as JoinedTenant;
    if (!tenant?.email) return [];
    return [
      {
        sessionDate: row.session_date as string,
        tenantName: tenant.full_name ?? "",
        tenantEmail: tenant.email,
      },
    ];
  });
}

/**
 * One entry per manager who has at least one tenant with suspended housing
 * benefit, scoped to that manager's own organisation.
 */
export async function getHousingBenefitAlerts(): Promise<HousingBenefitAlert[]> {
  const { data: managers, error: managersErr } = await adminClient
    .from("profiles")
    .select("email, full_name, org_id")
    .eq("role", "manager");

  if (managersErr) throw new Error(`Managers query failed: ${managersErr.message}`);

  const alerts: HousingBenefitAlert[] = [];

  for (const manager of managers ?? []) {
    if (!manager.org_id || !manager.email) continue;

    const { data: atRisk, error: atRiskErr } = await adminClient
      .from("tenants")
      .select("full_name, housing_benefit_status")
      .eq("org_id", manager.org_id)
      .eq("is_archived", false)
      .in("housing_benefit_status", ["suspended"]);

    if (atRiskErr) {
      throw new Error(`At-risk tenants query failed for org ${manager.org_id}: ${atRiskErr.message}`);
    }
    if (!atRisk?.length) continue;

    alerts.push({
      managerName: manager.full_name as string,
      managerEmail: manager.email as string,
      tenants: atRisk.map((t) => ({
        name: t.full_name as string,
        status: t.housing_benefit_status as string,
      })),
    });
  }

  return alerts;
}
