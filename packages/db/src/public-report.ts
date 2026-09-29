/**
 * Read models for the public wall-QR repair report (BUILD_PLAN C33,
 * apps/web's /report/[propertyId]). This route has no signed-in user at
 * all — there is no RLS context to read through — so, like
 * notifications.ts, the queries live HERE, with the service-role client,
 * so H2 (service-role stays inside packages/db) is never at risk of an
 * apps/web route importing it directly.
 */
import { adminClient } from "./client";

export interface ReportableProperty { id: string; orgId: string; name: string }

export async function getPropertyForReport(propertyId: string): Promise<ReportableProperty | null> {
  const { data, error } = await adminClient.from("properties").select("id, org_id, name").eq("id", propertyId).maybeSingle();
  if (error || !data) return null;
  return { id: data.id as string, orgId: data.org_id as string, name: data.name as string };
}

/** How many QR reports this property has had in the last `windowMs` — the rate limit's own count. */
export async function countRecentQrReports(propertyId: string, windowMs: number): Promise<number> {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await adminClient
    .from("maintenance_tickets")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId)
    .eq("reported_via", "qr")
    .gte("created_at", since);
  if (error) return 0;
  return count ?? 0;
}
