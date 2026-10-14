import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { withRouteHandler } from "../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../lib/safe-error";
import { DIARY_KINDS, type DiaryItem } from "../../../lib/diary";

export const dynamic = "force-dynamic";

const KINDS = new Set<string>(DIARY_KINDS.map((k) => k.key));
const STATUSES = new Set(["confirmed", "unconfirmed", "cancelled"]);


/**
 * GET /api/diary?from&to&who&q — the diary, read from everywhere a date
 * lives (Matloob, 2026-10-14; Rume, 2026-10-15 "a senior diary planner"):
 * hand-made events (with status), booked viewings, support sessions,
 * promises, open repairs (with assignee), certificates running out,
 * move-ins, and RENT DUE (unpaid service charges, with the amount — the
 * pink chips). `who` narrows to one person's day; `q` searches titles.
 */
export const GET = withRouteHandler({ resource: "tenants", action: "read" }, async (req, _ctx, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ items: [], people: [] });
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get("to") ?? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const who = url.searchParams.get("who");
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const org = auth.actor.org_id;
  try {
    const [entries, sessions, commitments, repairs, certs, moveIns, rent] = await Promise.all([
      db().query<{ id: string; kind: string; title: string; starts_at: string; ends_at: string | null; done_at: string | null; status: string; notes: string | null; tenant_id: string | null; property_id: string | null; lead_id: string | null; created_by: string; assigned_to: string | null; tenant: string | null; property: string | null }>(
        `SELECT d.*, t.full_name AS tenant, p.name AS property FROM diary_entries d LEFT JOIN tenants t ON t.id = d.tenant_id LEFT JOIN properties p ON p.id = d.property_id
         WHERE d.org_id = $1 AND d.starts_at >= $2::date AND d.starts_at < ($3::date + 1) ORDER BY d.starts_at`, [org, from, to]),
      db().query<{ id: string; session_date: string; tenant_id: string; full_name: string; session_type: string | null; entered_by_name: string | null }>(
        `SELECT s.id, s.session_date, s.tenant_id, t.full_name, s.session_type, s.entered_by_name FROM sessions s JOIN tenants t ON t.id = s.tenant_id
         WHERE t.org_id = $1 AND s.session_date BETWEEN $2::date AND $3::date`, [org, from, to]).catch(() => ({ rows: [] })),
      db().query<{ id: string; text: string; due_on: string; status: string; tenant_id: string | null; full_name: string | null; owner: string }>(
        `SELECT c.id, c.text, c.due_on, c.status, c.tenant_id, t.full_name, c.owner FROM commitments c LEFT JOIN tenants t ON t.id = c.tenant_id
         WHERE c.org_id = $1 AND c.due_on BETWEEN $2::date AND $3::date`, [org, from, to]).catch(() => ({ rows: [] })),
      db().query<{ id: string; issue_type: string; room_number: string | null; status: string; created_at: string; tenant_id: string | null; assignee: string | null }>(
        `SELECT m.id, m.issue_type, m.room_number, m.status, m.created_at, m.tenant_id, pr.full_name AS assignee FROM maintenance_tickets m LEFT JOIN profiles pr ON pr.id = m.assigned_to
         WHERE m.org_id = $1 AND m.status NOT IN ('resolved','closed') AND m.created_at::date BETWEEN $2::date AND $3::date`, [org, from, to]).catch(() => ({ rows: [] })),
      db().query<{ id: string; expires_on: string; name: string; property_id: string; property: string }>(
        `SELECT c.id, c.expires_on, ct.name, c.property_id, p.name AS property FROM certificates c JOIN certificate_types ct ON ct.id = c.certificate_type_id JOIN properties p ON p.id = c.property_id
         WHERE c.org_id = $1 AND c.expires_on BETWEEN $2::date AND ($3::date + 30)`, [org, from, to]).catch(() => ({ rows: [] })),
      db().query<{ id: string; full_name: string; moved_in: string; room_number: string | null }>(
        `SELECT id, full_name, moved_in, room_number FROM tenants WHERE org_id = $1 AND moved_in BETWEEN $2::date AND $3::date`, [org, from, to]).catch(() => ({ rows: [] })),
      db().query<{ id: string; amount: string; due_date: string; is_paid: boolean; tenant_id: string; full_name: string; room_number: string | null }>(
        `SELECT sc.id, sc.amount, sc.due_date, sc.is_paid, sc.tenant_id, t.full_name, t.room_number FROM service_charges sc JOIN tenants t ON t.id = sc.tenant_id
         WHERE t.org_id = $1 AND sc.due_date BETWEEN $2::date AND $3::date ORDER BY sc.due_date`, [org, from, to]).catch(() => ({ rows: [] })),
    ]);

    const today0 = new Date(new Date().toDateString());
    const all: DiaryItem[] = [
      ...entries.rows.map((d) => ({ id: d.id, source: (d.kind === "viewing" && (d.lead_id || d.tenant_id) ? "viewing" : "diary") as DiaryItem["source"], kind: d.kind, title: d.title, at: d.starts_at, endAt: d.ends_at, allDay: false, done: Boolean(d.done_at), status: (d.status || "confirmed") as DiaryItem["status"], href: d.lead_id ? "/leads" : d.tenant_id ? `/tenants/${d.tenant_id}` : d.property_id ? `/properties/${d.property_id}` : null, who: d.tenant, where: d.property, notes: d.notes, assignedTo: d.assigned_to, amount: null })),
      ...sessions.rows.map((s) => ({ id: s.id, source: "session" as const, kind: "session", title: `Support session · ${s.full_name}${s.session_type ? ` · ${s.session_type}` : ""}`, at: s.session_date, endAt: null, allDay: true, done: new Date(s.session_date) < today0, status: "confirmed" as const, href: `/tenants/${s.tenant_id}?tab=sessions`, who: s.full_name, where: null, notes: null, assignedTo: s.entered_by_name, amount: null })),
      ...commitments.rows.map((c) => ({ id: c.id, source: "commitment" as const, kind: "promise", title: `${c.owner === "tenant" ? "They promised" : "We promised"}: ${c.text}`, at: c.due_on, endAt: null, allDay: true, done: c.status !== "open", status: "confirmed" as const, href: c.tenant_id ? `/tenants/${c.tenant_id}` : null, who: c.full_name, where: null, notes: null, assignedTo: null, amount: null })),
      ...repairs.rows.map((r) => ({ id: r.id, source: "repair" as const, kind: "maintenance", title: `Repair · ${r.issue_type}${r.room_number ? ` · ${r.room_number}` : ""}`, at: r.created_at, endAt: null, allDay: false, done: false, status: (r.assignee ? "confirmed" : "unconfirmed") as DiaryItem["status"], href: "/maintenance", who: null, where: r.room_number, notes: `Status: ${r.status}`, assignedTo: r.assignee, amount: null })),
      ...certs.rows.map((c) => ({ id: c.id, source: "certificate" as const, kind: "task", title: `Task: renew ${c.name} · ${c.property}`, at: c.expires_on, endAt: null, allDay: true, done: false, status: "unconfirmed" as const, href: `/properties/${c.property_id}`, who: null, where: c.property, notes: `Runs out ${c.expires_on}`, assignedTo: null, amount: null })),
      ...moveIns.rows.map((t) => ({ id: t.id, source: "move_in" as const, kind: "move_in", title: `Move in · ${t.full_name}${t.room_number ? ` · ${t.room_number}` : ""}`, at: t.moved_in, endAt: null, allDay: true, done: new Date(t.moved_in) < today0, status: "confirmed" as const, href: `/tenants/${t.id}`, who: t.full_name, where: t.room_number, notes: null, assignedTo: null, amount: null })),
      ...rent.rows.map((r) => ({ id: r.id, source: "rent_due" as const, kind: "rent_due", title: `£${Number(r.amount).toFixed(2)} rent due from ${r.full_name}`, at: r.due_date, endAt: null, allDay: true, done: r.is_paid, status: "confirmed" as const, href: `/tenants/${r.tenant_id}?tab=ledger`, who: r.full_name, where: r.room_number, notes: r.is_paid ? "Paid" : "Not yet paid", assignedTo: null, amount: Number(r.amount) })),
    ].filter((i) => i.at.slice(0, 10) >= from && i.at.slice(0, 10) <= to).sort((a, b) => a.at.localeCompare(b.at));

    const people = [...new Set(all.map((i) => i.assignedTo).filter((x): x is string => Boolean(x)))].sort();
    let items = who ? all.filter((i) => i.assignedTo === who) : all;
    if (q) items = items.filter((i) => `${i.title} ${i.who ?? ""} ${i.where ?? ""} ${i.notes ?? ""}`.toLowerCase().includes(q));
    return NextResponse.json({ from, to, items, people }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[diary:GET]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});

/** POST — a new event: kind, title, when (start, optional end), who does it, tenant/property, status, notes. */
export const POST = withRouteHandler({ resource: "tenants", action: "create" }, async (req, _ctx, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { kind?: string; title?: string; starts_at?: string; ends_at?: string | null; tenant_id?: string | null; property_id?: string | null; notes?: string; assigned_to?: string | null; status?: string } | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const kind = KINDS.has(body?.kind ?? "") ? body!.kind! : "other";
  const status = STATUSES.has(body?.status ?? "") ? body!.status! : "confirmed";
  if (!title) return NextResponse.json({ error: "What is it? Give it a title." }, { status: 422 });
  if (!body?.starts_at || Number.isNaN(Date.parse(body.starts_at))) return NextResponse.json({ error: "When? Pick a date and time." }, { status: 422 });
  if (body.ends_at && (Number.isNaN(Date.parse(body.ends_at)) || Date.parse(body.ends_at) < Date.parse(body.starts_at))) return NextResponse.json({ error: "The end must be after the start." }, { status: 422 });
  try {
    const { data } = await writeWithAudit({
      table: "diary_entries",
      record: { org_id: auth.actor.org_id, kind, title, starts_at: body.starts_at, ends_at: body.ends_at || null, tenant_id: body.tenant_id || null, property_id: body.property_id || null, notes: body.notes?.trim() || null, assigned_to: body.assigned_to?.trim() || null, status, created_by: auth.actor.user_name } as Record<string, unknown>,
      action: "CREATE", org_id: auth.actor.org_id, ...auth.actor,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
