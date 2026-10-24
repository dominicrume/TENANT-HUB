/**
 * Landlord profile — what you land on when you click a landlord's name
 * anywhere (walkthrough 2026-10-09: "take me to his profile and I see all
 * the details… and all his properties under his name"). Main details are
 * editable in place; properties list with rooms filled/empty and a direct
 * "add a property for them"; the documents we've asked them for.
 */
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AvatarPhoto } from "../../../../components/AvatarPhoto";
import { FilesPanel } from "../../../../components/files/FilesPanel";
import { useParams, useRouter } from "next/navigation";
import { formatShortDate } from "../../../../lib/format";

interface Landlord { id: string; name: string; contact_email: string | null; contact_phone: string | null; notes: string | null; created_at: string; has_portal?: boolean | null; portal_name?: string | null }
interface Prop { id: string; name: string; address_line1: string | null; city: string | null; postcode: string | null; asset_class: string; unitsCount: number; occupiedCount: number }
interface Doc { id: string; document_type: string; status: string; requested_at: string | null; notified_at: string | null; received_at: string | null; property_id: string; property_name: string }
interface Data { landlord: Landlord; properties: Prop[]; documents: Doc[]; tenantsCount: number }

const TYPE_LABEL: Record<string, string> = { supported: "Supported accommodation", residential: "Residential", commercial: "Commercial", mixed: "Other" };

export default function LandlordPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState(""); const [notes, setNotes] = useState("");
  const [hasPortal, setHasPortal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/landlords/${id}`);
    if (!r.ok) { const b = await r.json().catch(() => null); setError(b?.error ?? "Couldn't load this landlord"); return; }
    const d = (await r.json()) as Data;
    setData(d);
    setName(d.landlord.name); setEmail(d.landlord.contact_email ?? ""); setPhone(d.landlord.contact_phone ?? ""); setNotes(d.landlord.notes ?? ""); setHasPortal(d.landlord.has_portal !== false);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function removeLandlord() {
    if (!data) return;
    const n = data.properties.length;
    const msg = n > 0
      ? `Remove ${data.landlord.name}? Their ${n} propert${n === 1 ? "y" : "ies"} stay in the system with the landlord set to "not set" — nothing else is deleted.`
      : `Remove ${data.landlord.name}? They have no properties. This can't be undone.`;
    if (!window.confirm(msg)) return;
    setBusy(true); setSaveError(null);
    const r = await fetch(`/api/landlords/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) { const b = await r.json().catch(() => null); setSaveError(b?.error ?? "Could not remove"); return; }
    router.push("/landlords");
    router.refresh();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setSaveError(null);
    const r = await fetch(`/api/landlords/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, contact_email: email || null, contact_phone: phone || null, notes: notes || null, has_portal: hasPortal }) });
    setBusy(false);
    if (!r.ok) { const b = await r.json().catch(() => null); setSaveError(b?.error ?? "Could not save"); return; }
    setEditing(false);
    await load();
  }

  if (error) return <div style={{ padding: "1.75rem" }}><p style={{ color: "var(--brick)" }}>{error}</p><Link href="/landlords" className="btn ghost sm">Back to landlords</Link></div>;
  if (!data) return <div style={{ padding: "1.75rem" }}><p className="muted">Loading…</p></div>;
  const { landlord, properties, documents, tenantsCount } = data;
  const rooms = properties.reduce((s, p) => s + p.unitsCount, 0);
  const filled = properties.reduce((s, p) => s + p.occupiedCount, 0);
  const outstanding = documents.filter((d) => d.status === "requested").length;
  const occPct = rooms ? Math.round((filled / rooms) * 100) : 0;
  const firstName = landlord.name.split(/\s+/)[0];
  const hasPortalOn = landlord.has_portal !== false;

  return (
    <div style={{ padding: "1.75rem", maxWidth: 920 }}>
      <p style={{ margin: "0 0 12px", fontSize: 12.5 }}><Link href="/landlords" style={{ color: "var(--slate)" }}>Landlords</Link> <span className="muted">/</span> {landlord.name}</p>

      <section className="card lord-hero" style={{ marginBottom: 14 }}>
        <div className="band" />
        <div className="body">
          <div className="avatar-ring">
            <AvatarPhoto
              src={`/api/landlords/${id}/photo`}
              name={landlord.name}
              size={76}
              editable
              onUpload={async (file) => {
                const fd = new FormData(); fd.append("file", file);
                const r = await fetch(`/api/landlords/${id}/photo`, { method: "POST", body: fd });
                if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.error ?? "Photo did not save"); }
              }}
              onRemove={async () => {
                const r = await fetch(`/api/landlords/${id}/photo`, { method: "DELETE" });
                if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.error ?? "Could not remove the photo"); }
              }}
            />
          </div>
          <div className="who">
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h1>{landlord.name}</h1>
              <span className="tag" style={{ background: "rgba(232,168,76,.16)", color: "var(--amber-deep)" }}>Landlord</span>
              {hasPortalOn && <span className="tag" style={{ background: "rgba(46,158,107,.1)", color: "var(--live)" }}>Own portal</span>}
            </div>
            <p className="meta">
              {landlord.contact_phone ? <a href={`tel:${landlord.contact_phone}`}>{landlord.contact_phone}</a> : <span className="muted">No phone on file</span>}
              <span className="muted">·</span>
              {landlord.contact_email ? <a href={`mailto:${landlord.contact_email}`}>{landlord.contact_email}</a> : <span className="muted">No email on file</span>}
              <span className="muted">·</span>
              <span>with us since {formatShortDate(landlord.created_at)}</span>
            </p>
          </div>
          <div className="acts">
            {landlord.contact_phone && <a href={`tel:${landlord.contact_phone}`} className="btn ghost sm" aria-label={`Call ${firstName}`}>Call</a>}
            {landlord.contact_email && <a href={`mailto:${landlord.contact_email}`} className="btn ghost sm" aria-label={`Email ${firstName}`}>Email</a>}
            <Link href={`/properties?addProperty=1&landlord=${id}`} className="rel sm">+ Add property</Link>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 14, padding: 0 }}>
        <div className="glance">
          <div className="ring-cell">
            <OccupancyRing filled={filled} total={rooms} />
            <div>
              <div className="k">Occupancy</div>
              <div className="v">{filled}<span className="over"> / {rooms || 0}</span></div>
              <div className="m">{rooms === 0 ? "no rooms yet" : filled === rooms ? "every room taken" : `${rooms - filled} room${rooms - filled === 1 ? "" : "s"} to fill`}</div>
            </div>
          </div>
          <div>
            <div className="k">Properties</div>
            <div className="v">{properties.length}</div>
            <div className="m">{properties.length === 0 ? "none yet" : "under their name"}</div>
          </div>
          <div>
            <div className="k">Tenants</div>
            <div className="v">{tenantsCount}</div>
            <div className="m">{tenantsCount === 0 ? "no one yet" : tenantsCount === 1 ? "living with us" : "living with us"}</div>
          </div>
          <div>
            <div className="k">Documents</div>
            <div className={`v ${outstanding ? "attn" : ""}`}>{outstanding}</div>
            <div className="m">{outstanding === 0 ? (documents.length ? "all in" : "none asked for") : `waiting · ${documents.length} asked in total`}</div>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <div className="ch"><h3>Main details</h3>
          {!editing && <button type="button" className="btn ghost sm" onClick={() => setEditing(true)}>Edit</button>}
        </div>
        {editing ? (
          <form onSubmit={save} className="li" style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <label><span className="lbl">Name</span><input value={name} onChange={(e) => setName(e.target.value)} required style={inp} /></label>
            <label><span className="lbl">Contact email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Where document requests go" style={inp} /></label>
            <label><span className="lbl">Contact phone</span><input value={phone} onChange={(e) => setPhone(e.target.value)} style={inp} /></label>
            <label style={{ gridColumn: "1 / -1" }}><span className="lbl">Notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Bank details for rent, preferred contact times, anything the team should know" style={{ ...inp, resize: "vertical" }} /></label>
            <label style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={hasPortal} onChange={(e) => setHasPortal(e.target.checked)} />
              <span><b style={{ fontSize: 13.5 }}>Has their own tenant portal</b><br /><span className="muted" style={{ fontSize: 12.5 }}>Station 7 of every tenant&apos;s journey (&ldquo;on the landlord&apos;s portal&rdquo;) only applies when this is on.</span></span>
            </label>
            {saveError && <p style={{ color: "var(--brick)", margin: 0, fontSize: 13, gridColumn: "1 / -1" }}>{saveError}</p>}
            <div style={{ display: "flex", gap: 8, gridColumn: "1 / -1", flexWrap: "wrap" }}>
              <button type="submit" className="rel sm" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</button>
              <button type="button" className="btn ghost sm" onClick={() => { setEditing(false); setSaveError(null); void load(); }}>Cancel</button>
              <button type="button" className="btn ghost sm" style={{ marginLeft: "auto", color: "var(--brick)" }} disabled={busy} onClick={() => void removeLandlord()}>Remove landlord…</button>
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

      <section className="card" style={{ marginBottom: 14 }}>
        <div className="ch">
          <h3>Properties we manage for {firstName} <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>· {properties.length} · {occPct}% full</span></h3>
          <Link href={`/properties?addProperty=1&landlord=${id}`} className="btn ghost sm">+ Add property</Link>
        </div>
        {properties.length === 0 ? (
          <div className="li"><div className="body"><b>No properties yet</b><p>Add the first one and it will show here, with its rooms and tenants.</p></div></div>
        ) : (
          <div className="pcard-grid">
            {properties.map((p) => <PropertyCard key={p.id} p={p} />)}
          </div>
        )}
      </section>

      <FilesPanel entity="landlord" id={id} mode="documents" title={`${firstName}'s documents`} />

      <section className="card">
        <div className="ch">
          <h3>Documents asked of {firstName}</h3>
          {outstanding > 0 && <span className="tag" style={{ background: "rgba(232,168,76,.16)", color: "var(--amber-deep)" }}>{outstanding} waiting</span>}
        </div>
        {documents.length === 0 ? <div className="li"><p className="muted">Nothing requested yet. Ask from a property&apos;s Documents section.</p></div> : documents.map((d) => (
          <div className="li" key={d.id}>
            <span className={`doc-dot ${d.status === "received" ? "received" : "waiting"}`} aria-hidden />
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

function OccupancyRing({ filled, total }: { filled: number; total: number }) {
  const pct = total ? filled / total : 0;
  const r = 28; const c = 2 * Math.PI * r;
  const dash = pct * c;
  const label = total ? `${filled} of ${total} rooms with people in` : "no rooms yet";
  const stroke = pct === 1 ? "var(--live)" : "var(--amber)";
  return (
    <svg width={72} height={72} viewBox="0 0 72 72" role="img" aria-label={label}>
      <circle cx={36} cy={36} r={r} fill="none" stroke="var(--line)" strokeWidth={7} />
      <circle cx={36} cy={36} r={r} fill="none" stroke={stroke} strokeWidth={7} strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`} transform="rotate(-90 36 36)"
              style={{ transition: "stroke-dasharray 700ms cubic-bezier(.4,0,.2,1), stroke 300ms ease" }} />
      <text x="36" y="41" textAnchor="middle" fontSize="14" fontWeight={700} fill="var(--navy)">
        {total ? `${Math.round(pct * 100)}%` : "—"}
      </text>
    </svg>
  );
}

function PropertyCard({ p }: { p: Prop }) {
  const pct = p.unitsCount ? (p.occupiedCount / p.unitsCount) * 100 : 0;
  const empty = p.unitsCount - p.occupiedCount;
  const full = p.unitsCount > 0 && empty === 0;
  const addr = [p.address_line1, p.city, p.postcode].filter(Boolean).join(", ") || "No address on file";
  return (
    <Link href={`/properties/${p.id}`} className="pcard" aria-label={`${p.name} — ${p.occupiedCount} of ${p.unitsCount} rooms filled`}>
      <div className="head">
        <span className="tag" style={{ background: "rgba(15,28,46,.06)", color: "var(--navy)" }}>{TYPE_LABEL[p.asset_class] ?? p.asset_class}</span>
        <span className="ttl">{p.name}</span>
        <span className="chev">›</span>
      </div>
      <p className="addr">{addr}</p>
      <div className="row2">
        <div className={`bar ${full ? "full" : ""}`}><i style={{ width: `${pct}%` }} /></div>
        <span className="nums">{p.occupiedCount}/{p.unitsCount || 0}</span>
        <span className={full ? "free live" : empty > 0 ? "free amber" : "free amber"}>{p.unitsCount === 0 ? "no rooms" : full ? "full" : `${empty} free`}</span>
      </div>
    </Link>
  );
}

const inp: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
