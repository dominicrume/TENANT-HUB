/**
 * Closing the loop between a lead and the tenant they become — by construction,
 * whichever door the tenant came in through (2026-10-15: a lead was signed up,
 * the tenant existed, and the Leads board still said "Sign up"; the intake had
 * started a second draft without the lead on it).
 *
 * Match order: the lead the draft carried → same phone → same email → same name,
 * among this organisation's open leads. On a match the lead moves to "moved in",
 * points at the tenant, and station 1 carries over (how they came to us).
 */
import { db, writeWithAudit } from "@tenant-hub/db";

type Actor = Omit<Parameters<typeof writeWithAudit>[0], "table" | "record" | "action" | "entry_method">;
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^44/, "0");

interface OpenLead { id: string; source: string | null; phone: string | null; email: string | null; full_name: string; viewing_done_at: string | null; assigned_to: string | null }

async function openLeads(orgId: string): Promise<OpenLead[]> {
  return (await db().query<OpenLead>(
    "SELECT id, source, phone, email, full_name, viewing_done_at, assigned_to FROM leads WHERE org_id = $1 AND tenant_id IS NULL AND stage NOT IN ('moved_in','lost') ORDER BY updated_at DESC", [orgId])).rows;
}

function pick(leads: OpenLead[], t: { fullName: string; phone?: string | null; email?: string | null }): OpenLead | null {
  const ph = digits(t.phone); const em = (t.email ?? "").trim().toLowerCase(); const nm = t.fullName.trim().toLowerCase().replace(/\s+/g, " ");
  return (ph && leads.find((l) => digits(l.phone) === ph))
    || (em && leads.find((l) => (l.email ?? "").toLowerCase() === em))
    || leads.find((l) => l.full_name.trim().toLowerCase().replace(/\s+/g, " ") === nm)
    || null;
}

async function close(lead: OpenLead, tenantId: string, orgId: string, actor: Actor, referralSource: string | null | undefined) {
  await writeWithAudit({ table: "leads", record: { id: lead.id, stage: "moved_in", tenant_id: tenantId } as Record<string, unknown>, action: "UPDATE", ...actor, org_id: orgId });
  const src = lead.source;
  if (!referralSource && (src === "self_referred" || src === "professionally_referred" || src === "via_advert")) {
    await writeWithAudit({ table: "tenants", record: { id: tenantId, referral_source: src } as Record<string, unknown>, action: "UPDATE", ...actor, org_id: orgId, tenant_id: tenantId }).catch(() => {});
  }
  // Station 2 carries over: the viewing done as a lead is the viewing done as a tenant.
  if (lead.viewing_done_at) {
    const have = await db().query("SELECT 1 FROM tenant_stations WHERE tenant_id = $1 AND station = 'viewing'", [tenantId]);
    if ((have.rowCount ?? 0) === 0) {
      await writeWithAudit({ table: "tenant_stations", record: { org_id: orgId, tenant_id: tenantId, station: "viewing", done_at: lead.viewing_done_at, done_by: lead.assigned_to ?? actor.user_name, assigned_to: lead.assigned_to } as Record<string, unknown>, action: "CREATE", ...actor, org_id: orgId, tenant_id: tenantId }).catch(() => {});
    }
  }
}

/** A tenant was just created: close the lead it came from (or the one it plainly is). Never throws. */
export async function linkTenantToLead(i: { orgId: string; tenantId: string; leadId?: string | null; fullName: string; phone?: string | null; email?: string | null; referralSource?: string | null; actor: Actor }): Promise<string | null> {
  try {
    const leads = await openLeads(i.orgId);
    const lead = (i.leadId && leads.find((l) => l.id === i.leadId)) || pick(leads, i);
    if (!lead) return null;
    await close(lead, i.tenantId, i.orgId, i.actor, i.referralSource);
    return lead.id;
  } catch (e) { console.warn("[lead-link] not linked", e); return null; }
}

/** Heals the board: any open lead whose person is already an (unarchived) tenant gets closed. Cheap — a handful of rows. */
export async function reconcileLeads(orgId: string, actor: Actor): Promise<number> {
  try {
    const leads = await openLeads(orgId);
    if (leads.length === 0) return 0;
    const tenants = (await db().query<{ id: string; full_name: string; mobile: string | null; email: string | null; referral_source: string | null }>(
      "SELECT id, full_name, mobile, email, referral_source FROM tenants WHERE org_id = $1 AND is_archived = false", [orgId])).rows;
    let n = 0;
    for (const t of tenants) {
      const lead = pick(leads, { fullName: t.full_name, phone: t.mobile, email: t.email });
      if (!lead) continue;
      await close(lead, t.id, orgId, actor, t.referral_source);
      leads.splice(leads.indexOf(lead), 1); n++;
    }
    return n;
  } catch (e) { console.warn("[lead-link] reconcile failed", e); return 0; }
}
