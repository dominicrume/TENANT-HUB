/**
 * Diary — "my diary gives me what I need to do; I need to know what my
 * people are doing that day" (Matloob, 2026-10-14). A week like a calendar
 * (one column a day) or a plain list; a chip per person so Umar sees AK's
 * day, Usama's day, his own. Viewings, sessions, promises, repairs,
 * certificates running out and move-ins come in on their own; add anything.
 */
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { DIARY_KINDS, SOURCE_ICON, type DiaryItem } from "../../../lib/diary";

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const startOfWeek = (d: Date) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; };
const dayKey = (iso: string) => iso.slice(0, 10);
const timeOf = (it: DiaryItem) => it.allDay ? "All day" : new Date(it.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const PERSON_COLOURS = ["#1E7F4F", "#B24A31", "#4C7CE8", "#7C3AED", "#0FB5A6", "#E8A84C", "#0F1C2E"];
const colourFor = (name: string | null, people: string[]) => name ? PERSON_COLOURS[Math.max(0, people.indexOf(name)) % PERSON_COLOURS.length] : "#8FA0B4";

export default function DiaryPage() {
  const [view, setView] = useState<"week" | "list">("week");
  const [start, setStart] = useState(() => ymd(startOfWeek(new Date())));
  const [who, setWho] = useState<string>("");
  const [items, setItems] = useState<DiaryItem[] | null>(null);
  const [people, setPeople] = useState<string[]>([]);
  const [staff, setStaff] = useState<Array<{ id: string; full_name: string }>>([]);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState("viewing"); const [title, setTitle] = useState(""); const [when, setWhen] = useState(""); const [notes, setNotes] = useState(""); const [assignee, setAssignee] = useState("");
  const [tenants, setTenants] = useState<Array<{ id: string; full_name: string }>>([]); const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([]);
  const [tenantId, setTenantId] = useState(""); const [propertyId, setPropertyId] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);

  const days = view === "week" ? 7 : 14;
  const load = useCallback(async () => {
    const to = ymd(addDays(new Date(start + "T00:00:00"), days - 1));
    try { const r = await fetch(`/api/diary?from=${start}&to=${to}${who ? `&who=${encodeURIComponent(who)}` : ""}`); if (r.ok) { const j = await r.json(); setItems(j.items); setPeople(j.people ?? []); } } catch { /* keep */ }
  }, [start, days, who]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    fetch("/api/tenants").then((r) => (r.ok ? r.json() : [])).then((d) => setTenants(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/properties").then((r) => (r.ok ? r.json() : [])).then((d) => setProperties(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/profiles").then((r) => (r.ok ? r.json() : [])).then((d) => setStaff(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/diary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, title, starts_at: new Date(when).toISOString(), notes, tenant_id: tenantId || null, property_id: propertyId || null, assigned_to: assignee || null }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "Could not add"); return; }
      setTitle(""); setWhen(""); setNotes(""); setTenantId(""); setPropertyId(""); setAssignee(""); setAdding(false);
      await load();
    } catch { setError("Could not reach the server."); } finally { setBusy(false); }
  }
  async function toggle(it: DiaryItem) {
    if (it.source !== "diary" && it.source !== "viewing") return;
    await fetch(`/api/diary/${it.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: !it.done }) });
    await load();
  }
  async function remove(it: DiaryItem) {
    if (!window.confirm("Remove this from the diary?")) return;
    await fetch(`/api/diary/${it.id}`, { method: "DELETE" });
    await load();
  }

  const keys: string[] = []; for (let i = 0; i < days; i++) keys.push(ymd(addDays(new Date(start + "T00:00:00"), i)));
  const byDay = new Map<string, DiaryItem[]>(); for (const k of keys) byDay.set(k, []);
  for (const it of items ?? []) { const k = dayKey(it.at); if (byDay.has(k)) byDay.get(k)!.push(it); }
  const today = ymd(new Date());
  const allPeople = [...new Set([...people, ...staff.map((s) => s.full_name)])].sort();
  const rangeLabel = `${new Date(start + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(keys[keys.length - 1] + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  const Item = ({ it, compact }: { it: DiaryItem; compact: boolean }) => (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start", padding: compact ? "6px 8px" : "10px 0", borderLeft: `3px solid ${colourFor(it.assignedTo, allPeople)}`, background: compact ? "var(--surface)" : "transparent", borderRadius: compact ? 8 : 0, opacity: it.done ? 0.5 : 1, boxShadow: compact ? "0 1px 2px rgba(15,28,46,.06)" : "none", border: compact ? "1px solid var(--line-soft)" : undefined, borderLeftWidth: 3 }}>
      <button type="button" onClick={() => void toggle(it)} disabled={it.source !== "diary" && it.source !== "viewing"} aria-label={it.done ? "Mark not done" : "Mark done"}
        style={{ width: 18, height: 18, marginTop: 1, borderRadius: "50%", border: `2px solid ${it.done ? "var(--live)" : "var(--line)"}`, background: it.done ? "var(--live)" : "#fff", color: "#fff", cursor: it.source === "diary" || it.source === "viewing" ? "pointer" : "default", flex: "none", fontSize: 10, lineHeight: "14px" }}>{it.done ? "✓" : ""}</button>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: compact ? 12 : 13.5, fontWeight: 600, textDecoration: it.done ? "line-through" : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: compact ? "nowrap" : "normal" }}>
          <span aria-hidden="true" style={{ marginRight: 4 }}>{SOURCE_ICON[it.source]}</span>{it.href ? <Link href={it.href} style={{ color: "inherit" }}>{it.title}</Link> : it.title}
        </div>
        <div className="muted" style={{ fontSize: compact ? 11 : 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {timeOf(it)}{it.assignedTo ? ` · ${it.assignedTo}` : ""}{!compact && it.where ? ` · ${it.where}` : ""}{!compact && it.notes ? ` · ${it.notes}` : ""}
        </div>
      </div>
      {(it.source === "diary" || it.source === "viewing") && !compact && <button type="button" className="btn ghost sm" onClick={() => void remove(it)} aria-label="Remove">✕</button>}
    </div>
  );

  return (
    <div style={{ padding: "1.75rem", maxWidth: 1180 }}>
      <div className="ch" style={{ padding: 0, marginBottom: 6, border: "none", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ margin: 0 }}>Diary <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>· {rangeLabel}</span></h1>
        <div className="btns">
          <button type="button" className="btn ghost sm" onClick={() => setStart(ymd(addDays(new Date(start + "T00:00:00"), -days)))} aria-label="Earlier">‹</button>
          <button type="button" className="btn ghost sm" onClick={() => setStart(view === "week" ? ymd(startOfWeek(new Date())) : today)}>Today</button>
          <button type="button" className="btn ghost sm" onClick={() => setStart(ymd(addDays(new Date(start + "T00:00:00"), days)))} aria-label="Later">›</button>
          <button type="button" className={view === "week" ? "rel sm" : "btn ghost sm"} onClick={() => { setView("week"); setStart(ymd(startOfWeek(new Date(start + "T00:00:00")))); }}>Week</button>
          <button type="button" className={view === "list" ? "rel sm" : "btn ghost sm"} onClick={() => setView("list")}>List</button>
          <button type="button" className="rel" onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "+ Add to diary"}</button>
        </div>
      </div>

      {/* Whose day: "you see Usama's calendar, AK's calendar, and this calendar". */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0 14px", alignItems: "center" }}>
        <button type="button" className={who === "" ? "rel sm" : "btn ghost sm"} onClick={() => setWho("")}>Everyone</button>
        {allPeople.map((p) => (
          <button key={p} type="button" className={who === p ? "rel sm" : "btn ghost sm"} onClick={() => setWho(who === p ? "" : p)} style={{ borderLeft: `4px solid ${colourFor(p, allPeople)}` }}>{p}</button>
        ))}
      </div>

      {adding && (
        <form onSubmit={add} className="card" style={{ marginBottom: 18, padding: 18, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <label><span className="lbl">What kind</span><select value={kind} onChange={(e) => setKind(e.target.value)} style={inp}>{DIARY_KINDS.map((k) => <option key={k.key} value={k.key}>{k.icon} {k.label}</option>)}</select></label>
          <label><span className="lbl">When</span><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required style={inp} /></label>
          <label><span className="lbl">Who does it</span><select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={inp}><option value="">—</option>{staff.map((s) => <option key={s.id} value={s.full_name}>{s.full_name}</option>)}</select></label>
          <label style={{ gridColumn: "1 / -1" }}><span className="lbl">What</span><input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Gas engineer at 72 Knowle Road, 10am" style={inp} /></label>
          <label><span className="lbl">Tenant (optional)</span><select value={tenantId} onChange={(e) => setTenantId(e.target.value)} style={inp}><option value="">—</option>{tenants.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></label>
          <label><span className="lbl">Property (optional)</span><select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} style={inp}><option value="">—</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label style={{ gridColumn: "1 / -1" }}><span className="lbl">Notes (optional)</span><input value={notes} onChange={(e) => setNotes(e.target.value)} style={inp} /></label>
          {error && <p style={{ color: "var(--brick)", margin: 0, fontSize: 13, gridColumn: "1 / -1" }}>{error}</p>}
          <div style={{ gridColumn: "1 / -1" }}><button type="submit" className="rel" disabled={busy || !title.trim() || !when}>{busy ? "Adding…" : "Add"}</button></div>
        </form>
      )}

      {items === null ? <section className="card"><div className="li"><p className="muted">Loading…</p></div></section>
        : view === "week" ? (
          <div className="week" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8 }}>
            {keys.map((k) => {
              const d = new Date(k + "T00:00:00"); const rows = byDay.get(k) ?? []; const isToday = k === today;
              return (
                <div key={k} style={{ background: isToday ? "rgba(232,168,76,.08)" : "var(--cream)", border: `1px solid ${isToday ? "var(--amber)" : "var(--line)"}`, borderRadius: 12, minHeight: 240, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "2px 2px 4px" }}>
                    <b style={{ fontSize: 12, color: isToday ? "var(--amber-deep)" : "var(--slate)" }}>{d.toLocaleDateString("en-GB", { weekday: "short" })}</b>
                    <span style={{ fontSize: 18, fontWeight: 600, color: isToday ? "var(--amber-deep)" : "var(--navy)" }}>{d.getDate()}</span>
                  </div>
                  {rows.length === 0 ? <span className="muted" style={{ fontSize: 11, padding: 2 }}>—</span> : rows.map((it) => <Item key={`${it.source}-${it.id}`} it={it} compact />)}
                </div>
              );
            })}
          </div>
        ) : keys.map((k) => {
          const rows = byDay.get(k) ?? []; const isToday = k === today; const d = new Date(k + "T00:00:00");
          return (
            <section className="card" key={k} style={{ marginBottom: 14, borderColor: isToday ? "var(--amber)" : undefined }}>
              <div className="ch"><h3 style={{ color: isToday ? "var(--amber-deep)" : undefined }}>{isToday ? "Today · " : ""}{d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</h3><span className="muted">{rows.length === 0 ? "nothing on" : `${rows.length} thing${rows.length === 1 ? "" : "s"}`}</span></div>
              <div style={{ padding: "0 18px" }}>{rows.length === 0 ? <p className="muted" style={{ margin: "10px 0" }}>Free.</p> : rows.map((it) => <Item key={`${it.source}-${it.id}`} it={it} compact={false} />)}</div>
            </section>
          );
        })}
      <style jsx>{`@media (max-width: 900px) { .week { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
