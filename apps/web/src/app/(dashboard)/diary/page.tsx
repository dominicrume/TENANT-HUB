/**
 * Diary — month / week / day / list / user, like the diary Osama runs the
 * office from (Apex27, 14 Oct 2026 screenshot), on our own data: viewings,
 * sessions, promises, repairs, certificate tasks, move-ins, rent due.
 *   · left: search, quick-jump mini month, event types, people's calendars
 *   · top: New event, ‹ › Jump Today, the five views
 *   · a chip per event: type colour, status mark, time, who it's for;
 *     rent due reads as money; click → details and the actions
 * Nothing in browser storage (H5); every event is a real row.
 */
"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { DIARY_KINDS, STATUS_MARK, kindMeta, type DiaryItem, type DiaryStatus } from "../../../lib/diary";
import { useAuth } from "../../../contexts/AuthContext";

type View = "month" | "week" | "day" | "list" | "user";
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (k: string) => new Date(k + "T00:00:00");
const startOfWeek = (d: Date) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x; };
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const timeOf = (it: DiaryItem) => (it.allDay ? "" : new Date(it.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
const PERSON_COLOURS = ["#1E7F4F", "#B24A31", "#4C7CE8", "#7C3AED", "#0FB5A6", "#E8A84C", "#D63384", "#0F1C2E"];

export default function DiaryPage() {
  const { profile } = useAuth();
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState<string>(() => ymd(new Date()));
  const [items, setItems] = useState<DiaryItem[] | null>(null);
  const [people, setPeople] = useState<string[]>([]);
  const [staff, setStaff] = useState<Array<{ id: string; full_name: string }>>([]);
  const [hiddenKinds, setHiddenKinds] = useState<Set<string>>(new Set());
  const [hiddenPeople, setHiddenPeople] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<DiaryItem | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; date?: string; item?: DiaryItem | null }>({ open: false });
  const [tenants, setTenants] = useState<Array<{ id: string; full_name: string; room_number?: string | null }>>([]);
  const [properties, setProperties] = useState<Array<{ id: string; name: string; postcode?: string | null; landlordName?: string | null }>>([]);

  // The window the current view needs.
  const range = useMemo(() => {
    const a = parse(anchor);
    if (view === "month") { const s = startOfWeek(startOfMonth(a)); return { from: ymd(s), to: ymd(addDays(s, 41)) }; }
    if (view === "week" || view === "user") { const s = startOfWeek(a); return { from: ymd(s), to: ymd(addDays(s, 6)) }; }
    if (view === "day") return { from: anchor, to: anchor };
    return { from: anchor, to: ymd(addDays(a, 29)) };
  }, [view, anchor]);

  const load = useCallback(async () => {
    try { const r = await fetch(`/api/diary?from=${range.from}&to=${range.to}${q ? `&q=${encodeURIComponent(q)}` : ""}`); if (r.ok) { const j = await r.json(); setItems(j.items); setPeople(j.people ?? []); } } catch { /* keep what we have */ }
  }, [range, q]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    fetch("/api/profiles").then((r) => (r.ok ? r.json() : [])).then((d) => setStaff(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/tenants").then((r) => (r.ok ? r.json() : [])).then((d) => setTenants(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/properties").then((r) => (r.ok ? r.json() : [])).then((d) => setProperties(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const allPeople = useMemo(() => [...new Set([...people, ...staff.map((s) => s.full_name)])].sort(), [people, staff]);
  const colourFor = (name: string | null) => (name ? PERSON_COLOURS[Math.max(0, allPeople.indexOf(name)) % PERSON_COLOURS.length] : "#8FA0B4");
  const visible = (items ?? []).filter((i) => !hiddenKinds.has(i.kind) && !(i.assignedTo && hiddenPeople.has(i.assignedTo)));
  const hiddenCount = (items ?? []).length - visible.length;
  const byDay = useMemo(() => { const m = new Map<string, DiaryItem[]>(); for (const it of visible) { m.set(it.day, [...(m.get(it.day) ?? []), it]); } return m; }, [visible]);
  const today = ymd(new Date());

  const go = (n: number) => { const a = parse(anchor); setAnchor(ymd(view === "month" ? new Date(a.getFullYear(), a.getMonth() + n, 1) : view === "day" ? addDays(a, n) : view === "list" ? addDays(a, 30 * n) : addDays(a, 7 * n))); };
  const title = view === "month" ? parse(anchor).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : view === "day" ? parse(anchor).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : `${parse(range.from).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${parse(range.to).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  async function patch(it: DiaryItem, body: Record<string, unknown>) {
    if (it.source !== "diary" && it.source !== "viewing") return;
    await fetch(`/api/diary/${it.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await load(); setSel(null);
  }
  async function remove(it: DiaryItem) {
    if (!window.confirm("Remove this event?")) return;
    await fetch(`/api/diary/${it.id}`, { method: "DELETE" }); await load(); setSel(null);
  }

  const Chip = ({ it, dense }: { it: DiaryItem; dense?: boolean }) => {
    const k = kindMeta(it.kind); const st = STATUS_MARK[it.status]; const money = it.source === "rent_due";
    return (
      <button type="button" onClick={() => setSel(it)} title={`${it.title}${it.assignedTo ? ` · ${it.assignedTo}` : ""}`}
        style={{ display: "flex", alignItems: "center", gap: 5, width: "100%", textAlign: "left", border: "none", cursor: "pointer", fontFamily: "inherit", borderRadius: 6, padding: dense ? "2px 6px" : "5px 8px", fontSize: dense ? 11.5 : 12.5, lineHeight: 1.25,
          background: money ? (it.done ? "rgba(214,51,132,.18)" : "#D63384") : "var(--surface)", color: money ? (it.done ? "#8a1f55" : "#fff") : "var(--navy)", borderLeft: money ? "none" : `4px solid ${it.assignedTo ? colourFor(it.assignedTo) : k.colour}`, boxShadow: money ? "none" : "0 1px 2px rgba(15,28,46,.08)", opacity: it.done && !money ? 0.55 : 1, textDecoration: it.status === "cancelled" ? "line-through" : undefined }}>
        {!money && <span style={{ color: st.colour, fontWeight: 700, flex: "none" }}>{st.mark}</span>}
        {!money && timeOf(it) && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "var(--slate)", flex: "none" }}>{timeOf(it)}</span>}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: money ? 600 : 500 }}>{money ? it.title : `${k.icon} ${it.title}`}</span>
      </button>
    );
  };

  const DayCell = ({ k, dim, max }: { k: string; dim?: boolean; max: number }) => {
    const rows = byDay.get(k) ?? []; const isToday = k === today; const d = parse(k);
    return (
      <div onDoubleClick={() => setEditor({ open: true, date: k })} style={{ minHeight: 120, padding: 6, background: isToday ? "rgba(232,168,76,.08)" : dim ? "#F4F1EC" : "var(--surface)", borderRight: "1px solid var(--line-soft)", borderBottom: "1px solid var(--line-soft)", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button type="button" onClick={() => { setAnchor(k); setView("day"); }} style={{ background: isToday ? "var(--amber)" : "none", border: "none", borderRadius: 20, minWidth: 26, height: 26, fontWeight: 600, color: isToday ? "var(--navy)" : dim ? "var(--slate-2)" : "var(--navy)", cursor: "pointer", fontFamily: "inherit" }}>{d.getDate()}</button>
          <button type="button" onClick={() => setEditor({ open: true, date: k })} aria-label="New event on this day" className="muted" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>+</button>
        </div>
        {rows.slice(0, max).map((it) => <Chip key={`${it.source}-${it.id}`} it={it} dense />)}
        {rows.length > max && <button type="button" onClick={() => { setAnchor(k); setView("day"); }} className="muted" style={{ background: "none", border: "none", textAlign: "left", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", padding: "0 6px" }}>+{rows.length - max} more</button>}
      </div>
    );
  };

  // Mini month for quick jump.
  const mini = useMemo(() => { const s = startOfWeek(startOfMonth(parse(anchor))); return Array.from({ length: 42 }, (_, i) => ymd(addDays(s, i))); }, [anchor]);
  const monthCells = useMemo(() => { const s = startOfWeek(startOfMonth(parse(anchor))); return Array.from({ length: 42 }, (_, i) => ymd(addDays(s, i))); }, [anchor]);
  const weekKeys = useMemo(() => { const s = parse(range.from); return Array.from({ length: 7 }, (_, i) => ymd(addDays(s, i))); }, [range.from]);
  const curMonth = parse(anchor).getMonth();

  return (
    <div style={{ padding: "1.25rem 1.75rem", maxWidth: 1400 }}>
      <div style={{ display: "grid", gridTemplateColumns: "230px minmax(0, 1fr)", gap: 16 }} className="diary-grid">
        {/* ── Left rail ─────────────────────────────────────────────── */}
        <aside style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <div>
            <div className="lbl">Search</div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type an event name" style={inp} />
          </div>
          <div>
            <div className="lbl" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>Quick jump
              <span><button type="button" onClick={() => setAnchor(ymd(new Date(parse(anchor).getFullYear(), parse(anchor).getMonth() - 1, 1)))} style={miniNav}>«</button><button type="button" onClick={() => setAnchor(ymd(new Date(parse(anchor).getFullYear(), parse(anchor).getMonth() + 1, 1)))} style={miniNav}>»</button></span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, margin: "2px 0 6px" }}>{parse(anchor).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, fontSize: 11 }}>
              {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => <div key={d} className="muted" style={{ textAlign: "center", fontWeight: 600 }}>{d}</div>)}
              {mini.map((k) => { const d = parse(k); const has = (byDay.get(k)?.length ?? 0) > 0; return (
                <button key={k} type="button" onClick={() => { setAnchor(k); if (view === "month" && d.getMonth() !== curMonth) setView("month"); }}
                  style={{ height: 24, borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 11, background: k === anchor ? "var(--navy)" : k === today ? "rgba(232,168,76,.3)" : "transparent", color: k === anchor ? "#fff" : d.getMonth() !== curMonth ? "var(--slate-2)" : "var(--navy)", fontWeight: has ? 700 : 400 }}>{d.getDate()}</button>); })}
            </div>
          </div>
          <div>
            <div className="lbl" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>Event types
              <span><button type="button" onClick={() => setHiddenKinds(new Set())} style={miniNav}>all</button>·<button type="button" onClick={() => setHiddenKinds(new Set(DIARY_KINDS.map((k) => k.key)))} style={miniNav}>none</button></span>
            </div>
            <div style={{ display: "grid", gap: 3 }}>
              {DIARY_KINDS.map((k) => (
                <label key={k.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
                  <input type="checkbox" checked={!hiddenKinds.has(k.key)} onChange={(e) => setHiddenKinds((s) => { const n = new Set(s); if (e.target.checked) n.delete(k.key); else n.add(k.key); return n; })} />
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: k.colour, flex: "none" }} />{k.icon} {k.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="lbl" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>{profile?.org_name ?? "Workspace"} · calendars
              {allPeople.length > 1 && <span><button type="button" onClick={() => setHiddenPeople(new Set())} style={miniNav}>all</button>·<button type="button" onClick={() => setHiddenPeople(new Set(allPeople))} style={miniNav}>none</button></span>}
            </div>
            <div style={{ display: "grid", gap: 3 }}>
              {allPeople.length === 0 && <span className="muted" style={{ fontSize: 12 }}>Assign something to someone and their calendar appears here.</span>}
              {allPeople.map((p) => (
                <label key={p} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
                  <input type="checkbox" checked={!hiddenPeople.has(p)} onChange={(e) => setHiddenPeople((s) => { const n = new Set(s); if (e.target.checked) n.delete(p); else n.add(p); return n; })} />
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: colourFor(p), flex: "none" }} />{p}{p === profile?.full_name ? " (you)" : ""}
                </label>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Calendar ─────────────────────────────────────────────── */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <button type="button" className="rel" onClick={() => setEditor({ open: true, date: anchor })}>+ New event</button>
            <h1 style={{ margin: "0 auto", fontSize: 22 }}>{title}</h1>
            <div className="btns">
              <button type="button" className="btn ghost sm" onClick={() => go(-1)} aria-label="Previous">‹</button>
              <button type="button" className="btn ghost sm" onClick={() => go(1)} aria-label="Next">›</button>
              <input type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} aria-label="Jump to date" style={{ ...inp, width: 150, minHeight: 36, padding: "4px 8px" }} />
              <button type="button" className="btn ghost sm" onClick={() => setAnchor(today)}>Today</button>
              {(["month", "week", "day", "list", "user"] as View[]).map((v) => <button key={v} type="button" className={view === v ? "rel sm" : "btn ghost sm"} onClick={() => setView(v)} style={{ textTransform: "capitalize" }}>{v}</button>)}
            </div>
          </div>

          {hiddenCount > 0 && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, fontSize: 12.5, color: "var(--amber-deep)" }}>
              <span>{hiddenCount} event{hiddenCount === 1 ? "" : "s"} in this range {hiddenCount === 1 ? "is" : "are"} hidden by the ticks on the left.</span>
              <button type="button" className="btn ghost sm" onClick={() => { setHiddenKinds(new Set()); setHiddenPeople(new Set()); }}>Show everything</button>
            </div>
          )}
          {items === null ? <div className="card"><div className="li"><p className="muted">Loading the diary…</p></div></div> : view === "month" ? (
            <div className="card" style={{ overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", background: "var(--cream)", borderBottom: "1px solid var(--line)" }}>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} style={{ padding: "8px 6px", fontSize: 12.5, fontWeight: 600, color: "var(--slate)", textAlign: "center" }}>{d}</div>)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
                {monthCells.map((k) => <DayCell key={k} k={k} dim={parse(k).getMonth() !== curMonth} max={4} />)}
              </div>
            </div>
          ) : view === "week" ? (
            <div className="card" style={{ overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
                {weekKeys.map((k) => <div key={k} style={{ padding: "8px 6px", fontSize: 12.5, fontWeight: 600, color: k === today ? "var(--amber-deep)" : "var(--slate)", textAlign: "center", background: "var(--cream)", borderBottom: "1px solid var(--line)" }}>{parse(k).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}</div>)}
                {weekKeys.map((k) => <DayCell key={k} k={k} max={12} />)}
              </div>
            </div>
          ) : view === "day" ? (
            <div className="card">
              {(byDay.get(anchor) ?? []).length === 0 ? <div className="li"><p className="muted">{hiddenCount > 0 ? "Nothing on that your ticks on the left allow — untick fewer types, or Show everything." : "Nothing on. Double-click a day in month view, or + New event."}</p></div>
                : (byDay.get(anchor) ?? []).map((it) => <div key={`${it.source}-${it.id}`} className="li" style={{ padding: "6px 12px" }}><Chip it={it} /></div>)}
            </div>
          ) : view === "list" ? (
            <div style={{ display: "grid", gap: 10 }}>
              {[...byDay.keys()].sort().map((k) => (
                <section className="card" key={k}><div className="ch"><h3 style={{ color: k === today ? "var(--amber-deep)" : undefined }}>{parse(k).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</h3><span className="muted">{byDay.get(k)!.length}</span></div>
                  {byDay.get(k)!.map((it) => <div key={`${it.source}-${it.id}`} className="li" style={{ padding: "6px 12px" }}><Chip it={it} /></div>)}</section>
              ))}
              {byDay.size === 0 && <div className="card"><div className="li"><p className="muted">Nothing in the next 30 days.</p></div></div>}
            </div>
          ) : (
            /* User view: a row per person, the week across. */
            <div className="card" style={{ overflowX: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: `160px repeat(7, minmax(140px, 1fr))`, minWidth: 1100 }}>
                <div style={{ background: "var(--cream)", borderBottom: "1px solid var(--line)" }} />
                {weekKeys.map((k) => <div key={k} style={{ padding: "8px 6px", fontSize: 12.5, fontWeight: 600, color: k === today ? "var(--amber-deep)" : "var(--slate)", textAlign: "center", background: "var(--cream)", borderBottom: "1px solid var(--line)" }}>{parse(k).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}</div>)}
                {[...allPeople, "Unassigned"].map((p) => (
                  <div key={p} style={{ display: "contents" }}>
                    <div style={{ padding: 8, fontWeight: 600, fontSize: 13, borderBottom: "1px solid var(--line-soft)", borderRight: "1px solid var(--line-soft)", display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: p === "Unassigned" ? "#8FA0B4" : colourFor(p), flex: "none" }} />{p}</div>
                    {weekKeys.map((k) => { const rows = (byDay.get(k) ?? []).filter((i) => p === "Unassigned" ? !i.assignedTo && i.source !== "rent_due" : i.assignedTo === p); return (
                      <div key={k} style={{ padding: 6, minHeight: 64, borderBottom: "1px solid var(--line-soft)", borderRight: "1px solid var(--line-soft)", display: "grid", gap: 4, alignContent: "start" }}>{rows.map((it) => <Chip key={`${it.source}-${it.id}`} it={it} dense />)}</div>); })}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: 12, color: "var(--slate)" }}>
            {Object.entries(STATUS_MARK).map(([k, v]) => <span key={k}><b style={{ color: v.colour }}>{v.mark}</b> {v.label}</span>)}
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#D63384", borderRadius: 3, verticalAlign: "middle" }} /> Rent due (faded = paid)</span>
            <span className="muted">Double-click a day to add. Click an event for details.</span>
          </div>
        </div>
      </div>

      {sel && <EventPopover it={sel} onClose={() => setSel(null)} onPatch={(b) => patch(sel, b)} onRemove={() => remove(sel)} onEdit={() => { setEditor({ open: true, item: sel }); setSel(null); }} />}
      {editor.open && <EventEditor date={editor.date} item={editor.item ?? null} staff={staff} tenants={tenants} properties={properties} onClose={() => setEditor({ open: false })} onSaved={(at, k) => {
        // Land on the day you just saved, with its type visible — you must see what you saved.
        setEditor({ open: false });
        setHiddenKinds((s) => { if (!s.has(k)) return s; const n = new Set(s); n.delete(k); return n; });
        setAnchor(ymd(new Date(at)));
        void load();
      }} />}
      <style jsx global>{`@media (max-width: 900px) { .diary-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

function EventPopover({ it, onClose, onPatch, onRemove, onEdit }: { it: DiaryItem; onClose: () => void; onPatch: (b: Record<string, unknown>) => void; onRemove: () => void; onEdit: () => void }) {
  const k = kindMeta(it.kind); const st = STATUS_MARK[it.status]; const own = it.source === "diary" || it.source === "viewing";
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(15,28,46,.35)", display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 440, boxShadow: "0 20px 50px rgba(15,28,46,.25)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", background: it.source === "rent_due" ? "#D63384" : k.colour, color: "#fff" }}>
          <div style={{ fontSize: 12, opacity: .85 }}>{k.icon} {k.label} · <b>{st.mark} {st.label}</b></div>
          <b style={{ fontSize: 16, display: "block", marginTop: 2 }}>{it.title}</b>
        </div>
        <div style={{ padding: 16, display: "grid", gap: 8, fontSize: 13.5 }}>
          <div><span className="muted">When</span> · {new Date(it.at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}{it.allDay ? " · all day" : ` · ${timeOf(it)}${it.endAt ? `–${new Date(it.endAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}`}</div>
          {it.assignedTo && <div><span className="muted">Who</span> · {it.assignedTo}</div>}
          {it.who && <div><span className="muted">Tenant</span> · {it.who}</div>}
          {it.where && <div><span className="muted">Where</span> · {it.where}</div>}
          {it.notes && <div><span className="muted">Notes</span> · {it.notes}</div>}
          {it.amount !== null && <div><span className="muted">Amount</span> · £{it.amount.toFixed(2)} · {it.done ? "paid" : "not yet paid"}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {it.href && <Link href={it.href} className="rel sm">Open</Link>}
            {own && <button type="button" className="btn ghost sm" onClick={() => onPatch({ done: !it.done })}>{it.done ? "Not done" : "Done ✓"}</button>}
            {own && it.status !== "confirmed" && <button type="button" className="btn ghost sm" onClick={() => onPatch({ status: "confirmed" })}>Confirm</button>}
            {own && it.status !== "cancelled" && <button type="button" className="btn ghost sm" onClick={() => onPatch({ status: "cancelled" })}>Cancel event</button>}
            {own && <button type="button" className="btn ghost sm" onClick={onEdit}>Edit</button>}
            {own && <button type="button" className="btn ghost sm" style={{ color: "var(--brick)" }} onClick={onRemove}>Remove</button>}
            <button type="button" className="btn ghost sm" onClick={onClose} style={{ marginLeft: "auto" }}>Close</button>
          </div>
          {!own && <p className="muted" style={{ margin: 0, fontSize: 12 }}>This comes from {it.source === "rent_due" ? "the ledger" : it.source === "repair" ? "Repairs" : it.source === "certificate" ? "Paperwork" : it.source === "session" ? "the tenant's sessions" : it.source === "commitment" ? "a promise on the record" : "the tenant record"} — change it there.</p>}
        </div>
      </div>
    </div>, document.body);
}

function EventEditor({ date, item, staff, tenants, properties, onClose, onSaved }: { date?: string; item: DiaryItem | null; staff: Array<{ id: string; full_name: string }>; tenants: Array<{ id: string; full_name: string; room_number?: string | null }>; properties: Array<{ id: string; name: string; postcode?: string | null; landlordName?: string | null }>; onClose: () => void; onSaved: (at: string, kind: string) => void }) {
  const { profile } = useAuth();
  const toLocal = (iso: string) => { const d = new Date(iso); return `${ymd(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const [kind, setKind] = useState(item?.kind ?? "viewing"); const [title, setTitle] = useState(item?.title ?? "");
  const [start, setStart] = useState(item ? toLocal(item.at) : `${date ?? ymd(new Date())}T10:00`); const [end, setEnd] = useState(item?.endAt ? toLocal(item.endAt) : "");
  const [who, setWho] = useState(item?.assignedTo ?? profile?.full_name ?? ""); const [status, setStatus] = useState<DiaryStatus>(item?.status ?? "confirmed"); const [notes, setNotes] = useState(item?.notes ?? "");
  const [tenantId, setTenantId] = useState(""); const [propertyId, setPropertyId] = useState("");
  // A sensible title writes itself from what's picked; typing your own always wins.
  const [auto, setAuto] = useState(!item);
  const suggest = (k: string, tId: string, pId: string) => {
    const t = tenants.find((x) => x.id === tId); const p = properties.find((x) => x.id === pId);
    const where = p ? p.name : t?.room_number ? `${t.room_number}` : "";
    return [kindMeta(k).label, t?.full_name, where].filter(Boolean).join(" · ");
  };
  const pick = (k = kind, tId = tenantId, pId = propertyId) => { if (auto) setTitle(suggest(k, tId, pId)); };
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const body = { kind, title, starts_at: new Date(start).toISOString(), ends_at: end ? new Date(end).toISOString() : null, assigned_to: who || null, status, notes, ...(item ? {} : { tenant_id: tenantId || null, property_id: propertyId || null }) };
    try {
      const r = await fetch(item ? `/api/diary/${item.id}` : "/api/diary", { method: item ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "Could not save"); return; }
      onSaved(body.starts_at, kind);
    } catch { setError("Could not reach the server."); } finally { setBusy(false); }
  }
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(15,28,46,.35)", display: "grid", placeItems: "center", padding: 16 }}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={save} style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 520, padding: 20, display: "grid", gap: 10, boxShadow: "0 20px 50px rgba(15,28,46,.25)" }}>
        <h3 style={{ margin: 0 }}>{item ? "Edit event" : "New event"}</h3>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {DIARY_KINDS.filter((k) => !["rent_due", "session", "promise"].includes(k.key)).map((k) => <button key={k.key} type="button" onClick={() => { setKind(k.key); pick(k.key); }} className={kind === k.key ? "rel sm" : "btn ghost sm"} style={{ borderLeft: `4px solid ${k.colour}` }}>{k.icon} {k.label}</button>)}
        </div>
        <label><span className="lbl">What</span><input value={title} onChange={(e) => { setTitle(e.target.value); setAuto(e.target.value.trim() === ""); }} required placeholder="Pick a tenant or property and this writes itself — or type it" style={inp} /></label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label><span className="lbl">Starts</span><input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required style={inp} /></label>
          <label><span className="lbl">Ends (optional)</span><input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} style={inp} /></label>
          <label><span className="lbl">Who does it</span><select value={who} onChange={(e) => setWho(e.target.value)} style={inp}><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.full_name}>{s.full_name}</option>)}</select></label>
          <label><span className="lbl">Status</span><select value={status} onChange={(e) => setStatus(e.target.value as DiaryStatus)} style={inp}><option value="confirmed">✓ Confirmed</option><option value="unconfirmed">? Unconfirmed</option><option value="cancelled">✕ Cancelled</option></select></label>
          {!item && <label><span className="lbl">For which tenant</span><select value={tenantId} onChange={(e) => { setTenantId(e.target.value); pick(kind, e.target.value, propertyId); }} style={inp}><option value="">No tenant — general</option>{tenants.map((t) => <option key={t.id} value={t.id}>{t.full_name}{t.room_number ? ` · ${t.room_number}` : ""}</option>)}</select></label>}
          {!item && <label><span className="lbl">At which property</span><select value={propertyId} onChange={(e) => { setPropertyId(e.target.value); pick(kind, tenantId, e.target.value); }} style={inp}><option value="">No property — anywhere</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}{p.postcode ? ` · ${p.postcode}` : ""}{p.landlordName ? ` · ${p.landlordName}` : ""}</option>)}</select></label>}
        </div>
        <label><span className="lbl">Notes</span><input value={notes} onChange={(e) => setNotes(e.target.value)} style={inp} /></label>
        {error && <p style={{ color: "var(--brick)", margin: 0, fontSize: 13 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button type="button" className="btn ghost sm" onClick={onClose}>Cancel</button><button type="submit" className="rel sm" disabled={busy || !title.trim() || !start}>{busy ? "Saving…" : "Save"}</button></div>
      </form>
    </div>, document.body);
}

const inp: React.CSSProperties = { width: "100%", minHeight: 42, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13.5, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
const miniNav: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--slate)", fontSize: 13, padding: "0 4px" };
