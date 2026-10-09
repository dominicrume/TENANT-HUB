/**
 * Landlord profile — what you land on when you click a landlord's name
 * anywhere (walkthrough 2026-10-09: "take me to his profile and I see all
 * the details… and all his properties under his name"). Main details are
 * editable in place; properties list with rooms filled/empty and a direct
 * "add a property for them"; the documents we've asked them for.
 */
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatShortDate } from "../../../../lib/format";

interface Landlord { id: string; name: string; contact_email: string | null; contact_phone: string | null; notes: string | null; created_at: string }
interface Prop { id: string; name: string; address_line1: string | null; city: string | null; postcode: string | null; asset_class: string; unitsCount: number; occupiedCount: number }
interface Doc { id: string; document_type: string; status: string; requested_at: string | null; notified_at: string | null; received_at: string | null; property_id: string; property_name: string }
interface Data { landlord: Landlord; properties: Prop[]; documents: Doc[]; tenantsCount: number }

const TYPE_LABEL: Record<string, string> = { supported: "Supported accommodation", residential: "Residential", commercial: "Commercial", mixed: "Other" };

export default function LandlordPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState(""); const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [photoBroken, setPhotoBroken] = useState(false);
  const [photoKey, setPhotoKey] = useState(0);

  const load = useCallback(async () => {
    const r = await fetch(`/api/landlords/${id}`);
    if (!r.ok) { const b = await r.json().catch(() => null); setError(b?.error ?? "Couldn't load this landlord"); return; }
    const d = (await r.json()) as Data;
    setData(d);
    setName(d.landlord.name); setEmail(d.landlord.contact_email ?? ""); setPhone(d.landlord.contact_phone ?? ""); setNotes(d.landlord.notes ?? "");
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setSaveError(null);
    const r = await fetch(`/api/landlords/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, contact_email: email || null, contact_phone: phone || null, notes: notes || null }) });
    setBusy(false);
    if (!r.ok) { const b = await r.json().catch(() => null); setSaveError(b?.error ?? "Could not save"); return; }
    setEditing(false);
    await load();
  }

  async function uploadPhoto(file: File) {
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch(`/api/landlords/${id}/photo`, { method: "POST", body: fd });
    if (r.ok) { setPhotoBroken(false); setPhotoKey((k) => k + 1); }
  }

  if (error) return <div style={{ padding: "1.75rem" }}><p style={{ color: "var(--brick)" }}>{error}</p><Link href="/properties" className="btn ghost sm">Back to properties</Link></div>;
  if (!data) return <div style={{ padding: "1.75rem" }}><p className="muted">Loading…</p></div>;
  const { landlord, properties, documents, tenantsCount } = data;
  const initials = landlord.name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const rooms = properties.reduce((s, p) => s + p.unitsCount, 0);
  const filled = properties.reduce((s, p) => s + p.occupiedCount, 0);
  const outstanding = documents.filter((d) => d.status === "requested").length;

  return (
    <div style={{ padding: "1.75rem", maxWidth: 860 }}>
      <p style={{ margin: "0 0 10px", fontSize: 12.5 }}><Link href="/landlords" style={{ color: "var(--slate)" }}>Landlords</Link> <span className="muted">/</span> {landlord.name}</p>

      <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <label title="Change photo" style={{ cursor: "pointer", position: "relative", width: 72, height: 72, borderRadius: "50%", overflow: "hidden", background: "var(--navy)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 600, fontSize: 24, flex: "none" }}>
          {!photoBroken && <Image key={photoKey} src={`/api/landlords/${id}/photo?v=${photoKey}`} alt="" fill sizes="72px" style={{ objectFit: "cover" }} unoptimized onError={() => setPhotoBroken(true)} />}
          {photoBroken && initials}
          <input type="file" accept="image/*" capture="user" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPhoto(f); e.target.value = ""; }} />
        </label>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0 }}>{landlord.name}</h1>
            <span className="tag" style={{ background: "rgba(232,168,76,.16)", color: "var(--amber-deep)" }}>Landlord</span>
          </div>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
            {landlord.contact_phone ? <a href={`tel:${landlord.contact_phone}`} style={{ color: "inherit" }}>{landlord.contact_phone}</a> : "No phone"} · {landlord.contact_email ? <a href={`mailto:${landlord.contact_email}`} style={{ color: "inherit" }}>{landlord.contact_email}</a> : "No email"} · with us since {formatShortDate(landlord.created_at)}
          </p>
        </div>
        <div className="btns">
          <Link href={`/properties?addProperty=1&landlord=${id}`} className="rel sm">+ Add a property for {landlord.name.split(/\s+/)[0]}</Link>
        </div>
      </div>

      <div className="stats" style={{ marginTop: 0, marginBottom: 18 }}>
        <div className="stat"><div className="k">Properties</div><div className="v">{properties.length}</div></div>
        <div className="stat"><div className="k">Rooms</div><div className="v">{rooms}</div><div className="m">{filled} filled · {rooms - filled} empty</div></div>
        <div className="stat"><div className="k">Tenants</div><div className="v">{tenantsCount}</div></div>
        <div className="stat"><div className="k">Documents owed</div><div className="v" style={{ color: outstanding ? "var(--amber-deep)" : undefined }}>{outstanding}</div><div className="m">{documents.length} asked for in total</div></div>
      </div>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="ch"><h3>Main details</h3>
          {!editing && <button type="button" className="btn ghost sm" onClick={() => setEditing(true)}>Edit</button>}
        </div>
        {editing ? (
          <form onSubmit={save} className="li" style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <label><span className="lbl">Name</span><input value={name} onChange={(e) => setName(e.target.value)} required style={inp} /></label>
            <label><span className="lbl">Contact email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Where document requests go" style={inp} /></label>
            <label><span className="lbl">Contact phone</span><input value={phone} onChange={(e) => setPhone(e.target.value)} style={inp} /></label>
            <label style={{ gridColumn: "1 / -1" }}><span className="lbl">Notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Bank details for rent, preferred contact times, anything the team should know" style={{ ...inp, resize: "vertical" }} /></label>
            {saveError && <p style={{ color: "var(--brick)", margin: 0, fontSize: 13, gridColumn: "1 / -1" }}>{saveError}</p>}
            <div style={{ display: "flex", gap: 8, gridColumn: "1 / -1" }}>
              <button type="submit" className="rel sm" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</button>
              <button type="button" className="btn ghost sm" onClick={() => { setEditing(false); setSaveError(null); void load(); }}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className="li" style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div><span className="lbl">Name</span><div>{landlord.name}</div></div>
            <div><span className="lbl">Contact email</span><div>{landlord.contact_email || <span className="muted">Not on file — document requests can&apos;t be emailed</span>}</div></div>
            <div><span className="lbl">Contact phone</span><div>{landlord.contact_phone || <span className="muted">Not on file</span>}</div></div>
            <div style={{ gridColumn: "1 / -1" }}><span className="lbl">Notes</span><div style={{ whiteSpace: "pre-wrap" }}>{landlord.notes || <span className="muted">None yet</span>}</div></div>
          </div>
        )}
      </section>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="ch"><h3>Properties we manage for {landlord.name.split(/\s+/)[0]}</h3>
          <Link href={`/properties?addProperty=1&landlord=${id}`} className="btn ghost sm">+ Add property</Link>
        </div>
        {properties.length === 0 ? <div className="li"><div className="body"><b>No properties yet</b><p>Add the first one and it will show here, with its rooms and tenants.</p></div></div> : properties.map((p) => (
          <Link key={p.id} href={`/properties/${p.id}`} className="li row">
            <span className="tag" style={{ background: "rgba(15,28,46,.06)", color: "var(--navy)", marginTop: 3 }}>{TYPE_LABEL[p.asset_class] ?? p.asset_class}</span>
            <div className="body">
              <b>{p.name}</b>
              <p>{[p.address_line1, p.city, p.postcode].filter(Boolean).join(", ") || "No address on file"} · {p.occupiedCount} of {p.unitsCount} rooms filled</p>
            </div>
            <span className="chev">›</span>
          </Link>
        ))}
      </section>

      <section className="card">
        <div className="ch"><h3>Documents asked of {landlord.name.split(/\s+/)[0]}</h3></div>
        {documents.length === 0 ? <div className="li"><p className="muted">Nothing requested yet. Ask from a property&apos;s Documents section.</p></div> : documents.map((d) => (
          <div className="li" key={d.id}>
            <div className="body">
              <b>{d.document_type} · <Link href={`/properties/${d.property_id}`} style={{ color: "var(--navy)" }}>{d.property_name}</Link></b>
              <p>{d.status === "received" ? `Received ${d.received_at ? formatShortDate(d.received_at) : ""}` : d.notified_at ? `Emailed ${formatShortDate(d.notified_at)} · waiting` : `Requested${d.requested_at ? ` ${formatShortDate(d.requested_at)}` : ""} · no email went (no address on file)`}</p>
            </div>
            <span className="tag" style={d.status === "received" ? { background: "rgba(30,127,79,.12)", color: "#1E7F4F" } : { background: "rgba(232,168,76,.16)", color: "var(--amber-deep)" }}>{d.status === "received" ? "Received" : "Waiting"}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
