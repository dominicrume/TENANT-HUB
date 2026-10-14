import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { withRouteHandler } from "../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../lib/safe-error";
import type { DiaryItem } from "../../../lib/diary";

export const dynamic = "force-dynamic";

const KINDS = new Set(["viewing", "inspection", "maintenance", "meeting", "call", "move_in", "move_out", "other"]);

/**
 * GET /api/diary?from=YYYY-MM-DD&to=YYYY-MM-DD — "my diary gives me what I
 * need to do: a viewing, maintenance, this" (Matloob, 2026-10-14). One day
 * view, read from everywhere a date lives: hand-made entries, booked
 * viewings, support sessions, promises (commitments), open repairs by the
 * day they were raised, certificates that run out. POST adds an entry.
 */
export const GET = withRouteHandler({ resource: "tenants", action: "read" }, async (req, _ctx, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ items: [] });
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get("to") ?? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const who = url.searchParams.get("who"); // a person's name → only their items
  const org = auth.actor.org_id;
  try {
    const [entries, sessions, commitments, repairs, certs, moveIns] = await Promise.all([
      db().query<{ id: string; kind: string; title: string; starts_at: string; done_at: string | null; notes: string | null; tenant_id: string | null; property_id: string | null; lead_id: string | null; created_by: string; assigned_to: string | null; tenant: string | null; property: string | null }>(
        `SELECT d.*, t.full_name AS tenant, p.name AS property FROM diary_entries d LEFT JOIN tenants t ON t.id = d.tenant_id LEFT JOIN properties p ON p.id = d.property_id
         WHERE d.org_id = $1 AND d.starts_at >= $2::date AND d.starts_at < ($3::date + 1) ORDER BY d.starts_at`, [org, from, to]),
      db().query<{ id: string; session_date: string; tenant_id: string; full_name: string; session_type: string | null }>(
        `SELECT s.id, s.session_date, s.tenant_id, t.full_name, s.session_type FROM sessions s JOIN tenants t ON t.id = s.tenant_id
         WHERE t.org_id = $1 AND s.session_date BETWEEN $2::date AND $3::date`, [org, from, to]).catch(() => ({ rows: [] as Array<{ id: string; session_date: string; tenant_id: string; full_name: string; session_type: string | null }> })),
      db().query<{ id: string; text: string; due_on: string; status: string; tenant_id: string | null; full_name: string | null; owner: string }>(
        `SELECT c.id, c.text, c.due_on, c.status, c.tenant_id, t.full_name, c.owner FROM commitments c LEFT JOIN tenants t ON t.id = c.tenant_id
         WHERE c.org_id = $1 AND c.due_on BETWEEN $2::date AND $3::date`, [org, from, to]).catch(() => ({ rows: [] as Array<{ id: string; text: string; due_on: string; status: string; tenant_id: string | null; full_name: string | null; owner: string }> })),
      db().query<{ id: string; issue_type: string; room_number: string | null; status: string; created_at: string; tenant_id: string | null; assignee: string | null }>(
        `SELECT m.id, m.issue_type, m.room_number, m.status, m.created_at, m.tenant_id, pr.full_name AS assignee FROM maintenance_tickets m LEFT JOIN profiles pr ON pr.id = m.assigned_to
         WHERE m.org_id = $1 AND m.status NOT IN ('resolved','closed') AND m.created_at::date BETWEEN $2::date AND $3::date`, [org, from, to]).catch(() => ({ rows: [] as Array<{ id: string; issue_type: string; room_number: string | null; status: string; created_at: string; tenant_id: string | null; assignee: string | null }> })),
      db().query<{ id: string; expires_on: string; name: string; property_id: string; property: string }>(
        `SELECT c.id, c.expires_on, ct.name, c.property_id, p.name AS property FROM certificates c JOIN certificate_types ct ON ct.id = c.certificate_type_id JOIN properties p ON p.id = c.property_id
         WHERE c.org_id = $1 AND c.expires_on BETWEEN $2::date AND $3::date`, [org, from, to]).catch(() => ({ rows: [] as Array<{ id: string; expires_on: string; name: string; property_id: string; property: string }> })),
      db().query<{ id: string; full_name: string; moved_in: string; room_number: string | null }>(
        `SELECT id, full_name, moved_in, room_number FROM tenants WHERE org_id = $1 AND moved_in BETWEEN $2::date AND $3::date`, [org, from, to]).catch(() => ({ rows: [] as Array<{ id: string; full_name: string; moved_in: string; room_number: string | null }> })),
    ]);

    const all: DiaryItem[] = [
      ...entries.rows.map((d) => ({ id: d.id, source: (d.kind === "viewing" && (d.lead_id || d.tenant_id) ? "viewing" : "diary") as DiaryItem["source"], kind: d.kind, title: d.title, at: d.starts_at, allDay: false, done: Boolean(d.done_at), href: d.lead_id ? "/leads" : d.tenant_id ? `/tenants/${d.tenant_id}` : d.property_id ? `/properties/${d.property_id}` : null, who: d.tenant, where: d.property, notes: d.notes, assignedTo: d.assigned_to })),
      ...sessions.rows.map((s) => ({ id: s.id, source: "session" as const, kind: "session", title: `Support session · ${s.full_name}${s.session_type ? ` · ${s.session_type}` : ""}`, at: s.session_date, allDay: true, done: new Date(s.session_date) < new Date(new Date().toDateString()), href: `/tenants/${s.tenant_id}?tab=sessions`, who: s.full_name, where: null, notes: null, assignedTo: null })),
      ...commitments.rows.map((c) => ({ id: c.id, source: "commitment" as const, kind: "promise", title: `${c.owner === "tenant" ? "They promised" : "We promised"}: ${c.text}`, at: c.due_on, allDay: true, done: c.status !== "open", href: c.tenant_id ? `/tenants/${c.tenant_id}` : null, who: c.full_name, where: null, notes: null, assignedTo: null })),
      ...repairs.rows.map((r) => ({ id: r.id, source: "repair" as const, kind: "maintenance", title: `Repair · ${r.issue_type}${r.room_number ? ` · ${r.room_number}` : ""}`, at: r.created_at, allDay: false, done: false, href: "/maintenance", who: null, where: r.room_number, notes: `Status: ${r.status}`, assignedTo: r.assignee })),
      ...certs.rows.map((c) => ({ id: c.id, source: "certificate" as const, kind: "inspection", title: `${c.name} runs out · ${c.property}`, at: c.expires_on, allDay: true, done: false, href: `/properties/${c.property_id}`, who: null, where: c.property, notes: null, assignedTo: null })),
      ...moveIns.rows.map((t) => ({ id: t.id, source: "move_in" as const, kind: "move_in", title: `Move in · ${t.full_name}${t.room_number ? ` · ${t.room_number}` : ""}`, at: t.moved_in, allDay: true, done: new Date(t.moved_in) < new Date(new Date().toDateString()), href: `/tenants/${t.id}`, who: t.full_name, where: t.room_number, notes: null, assignedTo: null })),
    ].sort((a, b) => a.at.localeCompare(b.at));
    const people = [...new Set(all.map((i) => i.assignedTo).filter((x): x is string => Boolean(x)))].sort();
    const items = who ? all.filter((i) => i.assignedTo === who) : all;
    return NextResponse.json({ from, to, items, people }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[diary:GET]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});

export const POST = withRouteHandler({ resource: "tenants", action: "create" }, async (req, _ctx, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { kind?: string; title?: string; starts_at?: string; ends_at?: string | null; tenant_id?: string | null; property_id?: string | null; notes?: string; assigned_to?: string | null } | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const kind = KINDS.has(body?.kind ?? "") ? body!.kind! : "other";
  if (!title) return NextResponse.json({ error: "What is it? Give it a title." }, { status: 422 });
  if (!body?.starts_at || Number.isNaN(Date.parse(body.starts_at))) return NextResponse.json({ error: "When? Pick a date and time." }, { status: 422 });
  try {
    const { data } = await writeWithAudit({
      table: "diary_entries",
      record: { org_id: auth.actor.org_id, kind, title, starts_at: body.starts_at, ends_at: body.ends_at || null, tenant_id: body.tenant_id || null, property_id: body.property_id || null, notes: body.notes?.trim() || null, assigned_to: body.assigned_to?.trim() || null, created_by: auth.actor.user_name } as Record<string, unknown>,
      action: "CREATE", org_id: auth.actor.org_id, ...auth.actor,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
});
