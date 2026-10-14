/**
 * Diary — "my diary gives me what I need to do: tomorrow I check — a
 * viewing, maintenance, this" (Matloob, 2026-10-14). One list, by day, read
 * from everywhere a date lives: viewings, sessions, promises, repairs,
 * certificates running out, move-ins — plus anything you add by hand.
 */
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { DIARY_KINDS, SOURCE_ICON, type DiaryItem } from "../../../lib/diary";

const dayKey = (iso: string) => iso.slice(0, 10);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const dayLabel = (k: string) => {
  const today = ymd(new Date()); const tomorrow = ymd(addDays(new Date(), 1));
  const d = new Date(k + "T00:00:00");
  const long = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return k === today ? `Today · ${long}` : k === tomorrow ? `Tomorrow · ${long}` : long;
};

export default function DiaryPage() {
  const [start, setStart] = useState(() => ymd(new Date()));
  const [days, setDays] = useState(7);
  const [items, setItems] = useState<DiaryItem[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState("viewing"); const [title, setTitle] = useState(""); const [when, setWhen] = useState(""); const [notes, setNotes] = useState("");
  const [tenants, setTenants] = useState<Array<{ id: string; full_name: string }>>([]); const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([]);
  const [tenantId, setTenantId] = useState(""); const [propertyId, setPropertyId] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const to = ymd(addDays(new Date(start + "T00:00:00"), days - 1));
    try { const r = await fetch(`/api/diary?from=${start}&to=${to}`); if (r.ok) setItems((await r.json()).items); } catch { /* keep */ }
  }, [start, days]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    fetch("/api/tenants").then((r) => (r.ok ? r.json() : [])).then((d) => setTenants(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/properties").then((r) => (r.ok ? r.json() : [])).then((d) => setProperties(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/diary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, title, starts_at: new Date(when).toISOString(), notes, tenant_id: tenantId || null, property_id: propertyId || null }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "Could not add"); return; }
      setTitle(""); setWhen(""); setNotes(""); setTenantId(""); setPropertyId(""); setAdding(false);
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

  return (
    <div style={{ padding: "1.75rem", maxWidth: 900 }}>
      <div className="ch" style={{ padding: 0, marginBottom: 6, border: "none", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ margin: 0 }}>Diary</h1>
        <div className="btns">
          <button type="button" className="btn ghost sm" onClick={() => setStart(ymd(addDays(new Date(start + "T00:00:00"), -days)))}>‹</button>
          <button type="button" className="btn ghost sm" onClick={() => setStart(ymd(new Date()))}>Today</button>
          <button type="button" className="btn ghost sm" onClick={() => setStart(ymd(addDays(new Date(start + "T00:00:00"), days)))}>›</button>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ ...inp, width: "auto", minHeight: 36, padding: "4px 8px" }} aria-label="How many days"><option value={1}>1 day</option><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select>
          <button type="button" className="rel" onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "+ Add to diary"}</button>
        </div>
      </div>
      <p className="sub">What has to happen, day by day. Viewings, sessions, promises, repairs and certificates come in on their own; add anything else.</p>

      {adding && (
        <form onSubmit={add} className="card" style={{ marginBottom: 18, padding: 18, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <label><span className="lbl">What kind</span><select value={kind} onChange={(e) => setKind(e.target.value)} style={inp}>{DIARY_KINDS.map((k) => <option key={k.key} value={k.key}>{k.icon} {k.label}</option>)}</select></label>
          <label><span className="lbl">When</span><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required style={inp} /></label>
          <label style={{ gridColumn: "1 / -1" }}><span className="lbl">What</span><input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Gas engineer at 72 Knowle Road, 10am" style={inp} /></label>
          <label><span className="lbl">Tenant (optional)</span><select value={tenantId} onChange={(e) => setTenantId(e.target.value)} style={inp}><option value="">—</option>{tenants.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></label>
          <label><span className="lbl">Property (optional)</span><select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} style={inp}><option value="">—</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label style={{ gridColumn: "1 / -1" }}><span className="lbl">Notes (optional)</span><input value={notes} onChange={(e) => setNotes(e.target.value)} style={inp} /></label>
          {error && <p style={{ color: "var(--brick)", margin: 0, fontSize: 13, gridColumn: "1 / -1" }}>{error}</p>}
          <div style={{ gridColumn: "1 / -1" }}><button type="submit" className="rel" disabled={busy || !title.trim() || !when}>{busy ? "Adding…" : "Add"}</button></div>
        </form>
      )}

      {items === null ? <section className="card"><div className="li"><p className="muted">Loading…</p></div></section> : keys.map((k) => {
        const rows = byDay.get(k) ?? [];
        const isToday = k === ymd(new Date());
        return (
          <section className="card" key={k} style={{ marginBottom: 14, borderColor: isToday ? "var(--amber)" : undefined }}>
            <div className="ch"><h3 style={{ color: isToday ? "var(--amber-deep)" : undefined }}>{dayLabel(k)}</h3><span className="muted">{rows.length === 0 ? "nothing on" : `${rows.length} thing${rows.length === 1 ? "" : "s"}`}</span></div>
            {rows.length === 0 ? <div className="li"><p className="muted" style={{ margin: 0 }}>Free.</p></div> : rows.map((it) => (
              <div className="li" key={`${it.source}-${it.id}`} style={{ alignItems: "center", opacity: it.done ? 0.55 : 1 }}>
                <button type="button" onClick={() => void toggle(it)} disabled={it.source !== "diary" && it.source !== "viewing"} aria-label={it.done ? "Mark not done" : "Mark done"} title={it.source === "diary" || it.source === "viewing" ? "Tick when done" : "Ticked where it lives"}
                  style={{ width: 28, height: 28, borderRadius: "50%", border: `2px solid ${it.done ? "var(--live)" : "var(--line)"}`, background: it.done ? "var(--live)" : "#fff", color: "#fff", cursor: it.source === "diary" || it.source === "viewing" ? "pointer" : "default", flex: "none", fontSize: 14 }}>{it.done ? "✓" : ""}</button>
                <span aria-hidden="true" style={{ fontSize: 18, width: 24, textAlign: "center" }}>{SOURCE_ICON[it.source]}</span>
                <div className="body">
                  <b style={{ textDecoration: it.done ? "line-through" : undefined }}>{it.href ? <Link href={it.href} style={{ color: "inherit" }}>{it.title}</Link> : it.title}</b>
                  <p>{it.allDay ? "All day" : new Date(it.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}{it.where ? ` · ${it.where}` : ""}{it.notes ? ` · ${it.notes}` : ""}</p>
                </div>
                {(it.source === "diary" || it.source === "viewing") && <button type="button" className="btn ghost sm" onClick={() => void remove(it)} aria-label="Remove">✕</button>}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
