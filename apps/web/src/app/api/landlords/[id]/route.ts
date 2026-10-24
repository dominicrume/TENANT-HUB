import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { LandlordCreateSchema } from "@tenant-hub/validation";
import { withRouteHandler } from "../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/landlords/[id] — the landlord's profile: who they are, every
 * property we manage for them (with rooms filled / empty), the documents
 * we've asked them for, and how many tenants sit under them. "When I click
 * the landlord it should give me his information… and all his properties
 * under his name, because we manage four or five for some" (walkthrough
 * 2026-10-09). One route, four small reads.
 */
export const GET = withRouteHandler({ resource: "properties", action: "read" }, async (_req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const orgId = auth.actor.org_id;
  try {
    const landlord = (await db().query("SELECT id, name, contact_email, contact_phone, notes, has_portal, portal_name, created_at, updated_at FROM landlords WHERE id = $1 AND org_id = $2", [params.id, orgId])).rows[0];
    if (!landlord) return NextResponse.json({ error: "Landlord not found" }, { status: 404 });

    const [properties, documents, tenants, rentRows, moveIns, docEvents, certEvents] = await Promise.all([
      db().query<{ id: string; name: string; address_line1: string | null; city: string | null; postcode: string | null; asset_class: string; units_count: string; occupied_count: string }>(
        `SELECT p.id, p.name, p.address_line1, p.city, p.postcode, p.asset_class,
                (SELECT count(*) FROM units u WHERE u.property_id = p.id) AS units_count,
                (SELECT count(*) FROM tenancies t JOIN units u ON u.id = t.unit_id WHERE u.property_id = p.id AND t.status = 'active') AS occupied_count
         FROM properties p WHERE p.landlord_id = $1 AND p.org_id = $2 ORDER BY p.name`, [params.id, orgId]),
      db().query<{ id: string; document_type: string; status: string; requested_at: string | null; notified_at: string | null; received_at: string | null; property_id: string; property_name: string }>(
        `SELECT pd.id, pd.document_type, pd.status, pd.requested_at, pd.notified_at, pd.received_at, pd.property_id, p.name AS property_name
         FROM property_documents pd JOIN properties p ON p.id = pd.property_id
         WHERE pd.requested_from_landlord_id = $1 AND pd.org_id = $2 ORDER BY pd.created_at DESC`, [params.id, orgId]),
      db().query<{ count: string }>(
        `SELECT count(DISTINCT t.tenant_id) AS count FROM tenancies t JOIN units u ON u.id = t.unit_id JOIN properties p ON p.id = u.property_id
         WHERE p.landlord_id = $1 AND p.org_id = $2 AND t.status = 'active'`, [params.id, orgId]),
      // Rent-roll — normalise every active tenancy at this landlord's properties to a monthly figure.
      db().query<{ amount: string; freq: string }>(
        `SELECT ty.rent_amount::text AS amount, ty.rent_frequency::text AS freq
         FROM tenancies ty JOIN units u ON u.id = ty.unit_id JOIN properties p ON p.id = u.property_id
         WHERE p.landlord_id = $1 AND p.org_id = $2 AND ty.status = 'active' AND ty.rent_amount > 0`, [params.id, orgId]),
      // Last 60 days of move-ins against this landlord's properties — tenants join properties via tenancies/units, no direct FK.
      db().query<{ id: string; name: string; moved_in: string | Date; room_number: string | null; property_name: string }>(
        `SELECT DISTINCT t.id, t.full_name AS name, t.moved_in, t.room_number, p.name AS property_name
         FROM tenants t
         JOIN tenancies ty ON ty.tenant_id = t.id AND ty.status = 'active'
         JOIN units u ON u.id = ty.unit_id
         JOIN properties p ON p.id = u.property_id
         WHERE p.landlord_id = $1 AND p.org_id = $2 AND t.is_archived = false
           AND t.moved_in IS NOT NULL AND t.moved_in >= (CURRENT_DATE - INTERVAL '60 days')
         ORDER BY t.moved_in DESC LIMIT 10`, [params.id, orgId]).catch(() => ({ rows: [] })),
      db().query<{ id: string; document_type: string; received_at: string | Date | null; notified_at: string | Date | null; property_name: string }>(
        `SELECT pd.id, pd.document_type, pd.received_at, pd.notified_at, p.name AS property_name
         FROM property_documents pd JOIN properties p ON p.id = pd.property_id
         WHERE pd.requested_from_landlord_id = $1 AND pd.org_id = $2 AND (pd.received_at >= (CURRENT_DATE - INTERVAL '60 days') OR pd.notified_at >= (CURRENT_DATE - INTERVAL '60 days'))
         ORDER BY COALESCE(pd.received_at, pd.notified_at) DESC LIMIT 10`, [params.id, orgId]).catch(() => ({ rows: [] })),
      db().query<{ id: string; cert_name: string; expires_on: string | Date | null; issued_on: string | Date | null; property_name: string }>(
        `SELECT c.id, ct.name AS cert_name, c.expires_on, c.issued_on, p.name AS property_name
         FROM certificates c JOIN certificate_types ct ON ct.id = c.certificate_type_id JOIN properties p ON p.id = c.property_id
         WHERE p.landlord_id = $1 AND p.org_id = $2 AND c.issued_on >= (CURRENT_DATE - INTERVAL '60 days')
         ORDER BY c.issued_on DESC LIMIT 10`, [params.id, orgId]).catch(() => ({ rows: [] })),
    ]);

    // Monthly rent-roll — one normalisation, same table every other rent view in the app uses.
    const toMonth = (amount: number, freq: string): number => {
      switch (freq) {
        case "weekly": return amount * (52 / 12);
        case "fortnightly": return amount * (26 / 12);
        case "four_weekly": return amount * (13 / 12);
        case "quarterly": return amount / 3;
        case "annually": case "yearly": return amount / 12;
        default: return amount;
      }
    };
    const rentRollMonthly = rentRows.rows.reduce((s, r) => s + toMonth(Number(r.amount), r.freq), 0);

    const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
    type Activity = { kind: "move_in" | "doc_received" | "doc_sent" | "cert_added"; at: string; title: string; detail: string; href: string };
    const activity: Activity[] = [
      ...moveIns.rows.map((t): Activity => ({ kind: "move_in", at: iso(t.moved_in) ?? "", title: `${t.name} moved in`, detail: `${t.property_name}${t.room_number ? ` · ${t.room_number}` : ""}`, href: `/tenants/${t.id}` })),
      ...docEvents.rows.filter((d) => d.received_at).map((d): Activity => ({ kind: "doc_received", at: iso(d.received_at)!, title: `${d.document_type} received`, detail: d.property_name, href: `/landlords/${params.id}` })),
      ...docEvents.rows.filter((d) => !d.received_at && d.notified_at).map((d): Activity => ({ kind: "doc_sent", at: iso(d.notified_at)!, title: `Asked for ${d.document_type}`, detail: d.property_name, href: `/landlords/${params.id}` })),
      ...certEvents.rows.filter((c) => c.issued_on).map((c): Activity => ({ kind: "cert_added", at: iso(c.issued_on)!, title: `${c.cert_name} on file`, detail: c.property_name, href: `/paperwork` })),
    ].filter((a) => a.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);

    return NextResponse.json({
      landlord,
      properties: properties.rows.map((p) => ({ ...p, unitsCount: Number(p.units_count), occupiedCount: Number(p.occupied_count) })),
      documents: documents.rows,
      tenantsCount: Number(tenants.rows[0]?.count ?? 0),
      rentRollMonthly,
      activity,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});

/**
 * DELETE /api/landlords/[id] — removes the landlord ("you can always add or
 * remove a landlord once you are logged in"). Properties, document requests
 * and sessions that pointed at them are set to "not set" (ON DELETE SET
 * NULL), never deleted. Audited; managers only.
 */
export const DELETE = withRouteHandler({ resource: "properties", action: "delete" }, async (_req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  if (auth.actor.user_role !== "manager" && auth.actor.user_role !== "admin") return NextResponse.json({ error: "Only managers can remove a landlord" }, { status: 403 });
  try {
    const row = (await db().query<{ id: string; name: string }>("SELECT id, name FROM landlords WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id])).rows[0];
    if (!row) return NextResponse.json({ error: "Landlord not found" }, { status: 404 });
    const props = Number((await db().query<{ n: string }>("SELECT count(*) AS n FROM properties WHERE landlord_id = $1", [params.id])).rows[0]?.n ?? 0);
    await db().query("DELETE FROM landlords WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id]);
    await writeWithAudit({
      table: "documents",
      record: { org_id: auth.actor.org_id, kind: "landlord_removed", title: `Removed landlord ${row.name}`, body: `${props} propert${props === 1 ? "y" : "ies"} left unassigned`, related_table: "landlords", related_id: params.id } as Record<string, unknown>,
      action: "CREATE", org_id: auth.actor.org_id, ...auth.actor,
    }).catch(() => {});
    return NextResponse.json({ ok: true, unassignedProperties: props });
  } catch (err) {
    console.error("[landlords:DELETE]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});

/** PATCH /api/landlords/[id] — name / contact email / phone / notes. */
export const PATCH = withRouteHandler({ resource: "properties", action: "update" }, async (req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const body = await req.json().catch(() => null);
  const parsed = LandlordCreateSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid landlord", issues: parsed.error.issues }, { status: 422 });
  if (parsed.data.name !== undefined && !parsed.data.name.trim()) return NextResponse.json({ error: "A landlord needs a name" }, { status: 422 });
  try {
    const owned = await db().query("SELECT id FROM landlords WHERE id = $1 AND org_id = $2", [params.id, auth.actor.org_id]);
    if (!owned.rows[0]) return NextResponse.json({ error: "Landlord not found" }, { status: 404 });
    const { data } = await writeWithAudit({
      table: "landlords",
      record: { id: params.id, ...parsed.data } as Record<string, unknown>,
      action: "UPDATE", org_id: auth.actor.org_id, ...auth.actor,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[landlords:PATCH]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
