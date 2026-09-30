/**
 * Property page — rooms, tenancies, certificates, policies for one property.
 * Add room / Add tenancy in three fields each; Print QR links to the
 * printable poster for this property's wall QR report route (BUILD_PLAN C29,
 * the route itself lands at C33). Renamed from "Home" at C45.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTenants } from "../../../../hooks/useTenants";
import { formatShortDate, formatMoney } from "../../../../lib/format";

interface PropertyDetail {
  property: { id: string; name: string; address_line1: string | null; city: string | null; postcode: string | null; asset_class: string; landlord_id: string | null };
  landlord: { id: string; name: string; contact_email: string | null; contact_phone: string | null } | null;
  units: Array<{ id: string; reference: string; unit_class: string; status: string; tenancy: { id: string; tenant_id: string; rent_amount: number; rent_frequency: string; tenants?: { full_name?: string } } | null }>;
  certificates: Array<{ id: string; issued_on: string | null; expires_on: string | null; certificate_types?: { name?: string } }>;
  policies: Array<{ id: string; insurer: string | null; policy_reference: string | null; renewal_date: string | null; annual_premium: number | null }>;
}
interface LandlordOption { id: string; name: string }

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeTenants } = useTenants();
  const [data, setData] = useState<PropertyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [landlordOptions, setLandlordOptions] = useState<LandlordOption[]>([]);
  const [landlordBusy, setLandlordBusy] = useState(false);
  const [landlordError, setLandlordError] = useState<string | null>(null);

  const [addingRoom, setAddingRoom] = useState(false);
  const [roomRef, setRoomRef] = useState("");
  const [roomClass, setRoomClass] = useState("supported");
  const [roomBusy, setRoomBusy] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);

  const [tenancyForUnit, setTenancyForUnit] = useState<string | null>(null);
  const [tenancyTenant, setTenancyTenant] = useState("");
  const [tenancyRent, setTenancyRent] = useState("150");
  const [tenancyFrequency, setTenancyFrequency] = useState("weekly");
  const [tenancyBusy, setTenancyBusy] = useState(false);
  const [tenancyError, setTenancyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/properties/${id}`);
    if (!res.ok) { const b = await res.json().catch(() => null); setError(b?.error ?? `${res.status} ${res.statusText}`); return; }
    setData(await res.json());
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { fetch("/api/landlords").then((r) => (r.ok ? r.json() : [])).then(setLandlordOptions).catch(() => {}); }, []);

  async function changeLandlord(landlordId: string) {
    setLandlordBusy(true); setLandlordError(null);
    const res = await fetch(`/api/properties/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ landlord_id: landlordId || null }),
    });
    setLandlordBusy(false);
    if (!res.ok) { const b = await res.json().catch(() => null); setLandlordError(b?.error ?? "Could not save the landlord"); return; }
    void load();
  }

  async function addRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!roomRef.trim()) return;
    setRoomBusy(true); setRoomError(null);
    const res = await fetch("/api/units", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_id: id, reference: roomRef, unit_class: roomClass }),
    });
    setRoomBusy(false);
    if (!res.ok) { const b = await res.json().catch(() => null); setRoomError(b?.error ?? "Could not add the room"); return; }
    setRoomRef(""); setRoomClass("supported"); setAddingRoom(false);
    void load();
  }

  async function addTenancy(e: React.FormEvent) {
    e.preventDefault();
    if (!tenancyForUnit || !tenancyTenant) return;
    setTenancyBusy(true); setTenancyError(null);
    const res = await fetch("/api/tenancies", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unit_id: tenancyForUnit, tenant_id: tenancyTenant, rent_amount: Number(tenancyRent), rent_frequency: tenancyFrequency }),
    });
    setTenancyBusy(false);
    if (!res.ok) { const b = await res.json().catch(() => null); setTenancyError(b?.error ?? "Could not add the tenancy"); return; }
    setTenancyForUnit(null); setTenancyTenant(""); setTenancyRent("150"); setTenancyFrequency("weekly");
    void load();
  }

  if (error) return <div style={{ padding: "1.75rem" }}><p style={{ color: "var(--brick)" }}>{error}</p></div>;
  if (!data) return <div style={{ padding: "1.75rem" }}><p className="muted">Loading…</p></div>;

  const { property, units, certificates, policies } = data;

  return (
    <div style={{ padding: "1.75rem", maxWidth: 820 }}>
      <div className="ch" style={{ padding: 0, marginBottom: 6, border: "none" }}>
        <h1 style={{ margin: 0 }}>{property.name}</h1>
        <Link href={`/properties/${id}/print`} className="btn ghost sm" target="_blank">Print QR</Link>
      </div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
        {[property.address_line1, property.city, property.postcode].filter(Boolean).join(", ") || "No address on file yet"}
      </p>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="ch"><h3>Landlord</h3></div>
        <div className="li" style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
          <select
            value={property.landlord_id ?? ""}
            onChange={(e) => void changeLandlord(e.target.value)}
            disabled={landlordBusy}
            style={inp}
          >
            <option value="">Not set</option>
            {landlordOptions.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {landlordError && <p style={{ color: "var(--brick)", fontSize: 13, margin: 0 }}>{landlordError}</p>}
          {data.landlord && (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {[data.landlord.contact_email, data.landlord.contact_phone].filter(Boolean).join(" · ") || "No contact details on file yet"}
            </p>
          )}
        </div>
      </section>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="ch"><h3>Rooms</h3>
          <button type="button" className="btn ghost sm" onClick={() => setAddingRoom((v) => !v)}>{addingRoom ? "Cancel" : "Add room"}</button>
        </div>
        {addingRoom && (
          <form onSubmit={addRoom} className="li" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ flex: 1, minWidth: 140 }}><span className="lbl">Room</span>
                <input value={roomRef} onChange={(e) => setRoomRef(e.target.value)} required placeholder="Room 4" style={inp} /></label>
              <label style={{ flex: 1, minWidth: 140 }}><span className="lbl">Type</span>
                <select value={roomClass} onChange={(e) => setRoomClass(e.target.value)} style={inp}>
                  <option value="supported">Supported</option><option value="residential">Residential</option><option value="commercial">Commercial</option>
                </select></label>
            </div>
            {roomError && <p style={{ color: "var(--brick)", fontSize: 13, margin: 0 }}>{roomError}</p>}
            <div><button type="submit" className="rel" disabled={roomBusy || !roomRef.trim()}>{roomBusy ? "Adding…" : "Add room"}</button></div>
          </form>
        )}
        {units.length === 0 && !addingRoom ? (
          <div className="li"><div className="body"><b>No rooms yet</b><p>Add the first one above.</p></div></div>
        ) : (
          units.map((u) => (
            <div className="li" key={u.id}>
              <div className="body">
                <b>{u.reference}</b>
                <p>
                  {u.tenancy ? `${u.tenancy.tenants?.full_name ?? "Tenant"} · ${formatMoney(u.tenancy.rent_amount)} ${u.tenancy.rent_frequency}` : "Vacant"}
                </p>
              </div>
              {!u.tenancy && (
                <button type="button" className="btn ghost sm" onClick={() => setTenancyForUnit(tenancyForUnit === u.id ? null : u.id)}>
                  {tenancyForUnit === u.id ? "Cancel" : "Add tenancy"}
                </button>
              )}
              {tenancyForUnit === u.id && (
                <form onSubmit={addTenancy} style={{ display: "grid", gap: 10, marginLeft: "auto", minWidth: 260 }}>
                  <select value={tenancyTenant} onChange={(e) => setTenancyTenant(e.target.value)} required style={inp}>
                    <option value="">Which tenant?</option>
                    {activeTenants.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </select>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input type="number" min="0" step="0.01" value={tenancyRent} onChange={(e) => setTenancyRent(e.target.value)} required style={inp} />
                    <select value={tenancyFrequency} onChange={(e) => setTenancyFrequency(e.target.value)} style={inp}>
                      <option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="four_weekly">4-weekly</option>
                      <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option>
                    </select>
                  </div>
                  {tenancyError && <p style={{ color: "var(--brick)", fontSize: 13, margin: 0 }}>{tenancyError}</p>}
                  <button type="submit" className="rel sm" disabled={tenancyBusy || !tenancyTenant}>{tenancyBusy ? "Adding…" : "Add tenancy"}</button>
                </form>
              )}
            </div>
          ))
        )}
      </section>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="ch"><h3>Certificates</h3></div>
        {certificates.length === 0 ? (
          <div className="li"><p className="muted">None on file yet.</p></div>
        ) : (
          certificates.map((c) => (
            <div className="li" key={c.id}><div className="body">
              <b>{c.certificate_types?.name ?? "Certificate"}</b>
              <p>{c.issued_on ? `Issued ${formatShortDate(c.issued_on)}` : "Issue date not on file"} · {c.expires_on ? `expires ${formatShortDate(c.expires_on)}` : "no expiry on file"}</p>
            </div></div>
          ))
        )}
      </section>

      <section className="card">
        <div className="ch"><h3>Insurance</h3></div>
        {policies.length === 0 ? (
          <div className="li"><p className="muted">No policy on file yet.</p></div>
        ) : (
          policies.map((p) => (
            <div className="li" key={p.id}><div className="body">
              <b>{p.insurer ?? "Insurer not on file"}</b>
              <p>{p.policy_reference ?? "No reference"} · renews {p.renewal_date ? formatShortDate(p.renewal_date) : "date not on file"}{p.annual_premium ? ` · ${formatMoney(p.annual_premium)}/yr` : ""}</p>
            </div></div>
          ))
        )}
      </section>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", minHeight: 40, padding: "9px 11px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13.5, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
