import { db } from "@tenant-hub/db";
import { computeJourney, nextStation, type JourneyFacts, type Station, type StationKey } from "./journey";

/**
 * Gathers the facts behind every station for one tenant or a whole
 * organisation, then lets lib/journey.ts colour them. One query per
 * source, batched — the dashboard list of 50 tenants is five queries, not
 * five hundred.
 */
export interface TenantJourney { tenantId: string; name: string; room: string | null; landlord: string | null; landlordId: string | null; referralSource: string | null; stations: Station[]; next: Station | null; done: number; total: number }

export async function journeysForOrg(orgId: string, onlyTenantId?: string): Promise<TenantJourney[]> {
  const params: unknown[] = [orgId];
  let where = "t.org_id = $1 AND t.is_archived = false";
  if (onlyTenantId) { params.push(onlyTenantId); where += ` AND t.id = $${params.length}`; }
  const tenants = await db().query<{ id: string; full_name: string; room_number: string | null; tenant_signature_hash: string | null; moved_in: string | null; is_active: boolean; referral_source: string | null; landlord_id: string | null; landlord: string | null; has_portal: boolean | null; active_tenancy: boolean }>(
    `SELECT t.id, t.full_name, t.room_number, t.tenant_signature_hash, t.moved_in::text, t.is_active, t.referral_source,
            l.id AS landlord_id, l.name AS landlord, l.has_portal,
            EXISTS (SELECT 1 FROM tenancies ty WHERE ty.tenant_id = t.id AND ty.status = 'active') AS active_tenancy
     FROM tenants t
     LEFT JOIN LATERAL (
       SELECT ll.id, ll.name, ll.has_portal FROM tenancies ty JOIN units u ON u.id = ty.unit_id JOIN properties p ON p.id = u.property_id LEFT JOIN landlords ll ON ll.id = p.landlord_id
       WHERE ty.tenant_id = t.id AND ty.status = 'active' ORDER BY ty.created_at DESC LIMIT 1) l ON TRUE
     WHERE ${where} ORDER BY t.moved_in DESC NULLS LAST, t.full_name`, params);
  if (tenants.rows.length === 0) return [];
  const ids = tenants.rows.map((t) => t.id);

  const [docs, ticks, leads] = await Promise.all([
    db().query<{ tenant_id: string; name: string }>("SELECT tenant_id, name FROM tenant_documents WHERE tenant_id = ANY($1) AND blob_id IS NOT NULL", [ids]),
    db().query<{ tenant_id: string; station: StationKey; done_at: string | null; done_by: string | null; assigned_to: string | null; note: string | null }>("SELECT tenant_id, station, done_at, done_by, assigned_to, note FROM tenant_stations WHERE tenant_id = ANY($1)", [ids]),
    db().query<{ tenant_id: string; stage: string; viewing_at: string | null }>("SELECT tenant_id, stage, viewing_at FROM leads WHERE tenant_id = ANY($1)", [ids]).catch(() => ({ rows: [] as Array<{ tenant_id: string; stage: string; viewing_at: string | null }> })),
  ]);
  const docsBy = new Map<string, string[]>(); for (const d of docs.rows) docsBy.set(d.tenant_id, [...(docsBy.get(d.tenant_id) ?? []), d.name]);
  const ticksBy = new Map<string, JourneyFacts["ticks"]>(); for (const k of ticks.rows) { const m = ticksBy.get(k.tenant_id) ?? {}; m[k.station] = { doneAt: k.done_at, doneBy: k.done_by, assignedTo: k.assigned_to, note: k.note }; ticksBy.set(k.tenant_id, m); }
  const leadBy = new Map<string, { stage: string; viewing_at: string | null }>(); for (const l of leads.rows) leadBy.set(l.tenant_id, l);

  return tenants.rows.map((t) => {
    const lead = leadBy.get(t.id);
    const stations = computeJourney({
      referralSource: t.referral_source,
      hasLead: Boolean(lead), leadStage: lead?.stage ?? null, leadViewingAt: lead?.viewing_at ?? null,
      signatureHash: t.tenant_signature_hash, movedIn: t.moved_in, activeTenancy: t.active_tenancy,
      documents: docsBy.get(t.id) ?? [], ticks: ticksBy.get(t.id) ?? {}, landlordHasPortal: t.landlord_id ? t.has_portal : null, isActive: t.is_active,
    });
    const applicable = stations.filter((s) => s.status !== "na" && s.key !== "moved_out");
    return { tenantId: t.id, name: t.full_name, room: t.room_number, landlord: t.landlord, landlordId: t.landlord_id, referralSource: t.referral_source, stations, next: nextStation(stations), done: applicable.filter((s) => s.status === "done").length, total: applicable.length };
  });
}
