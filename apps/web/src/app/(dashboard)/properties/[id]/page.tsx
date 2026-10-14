/**
 * Property page — rooms, tenancies, documents, certificates, policies for
 * one property. Add room / Add tenancy in three fields each; Print QR links
 * to the printable poster for this property's wall QR report route
 * (BUILD_PLAN C29, the route itself lands at C33). Renamed from "Home" at C45.
 *
 * C50/C51: a "Documents" section, separate from Certificates (the compliance
 * matrix — untouched) — the property's own lease/invoices/etc, either added
 * directly or requested from the landlord and attached once it arrives.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatShortDate, formatMoney } from "../../../../lib/format";
import { PROPERTY_DOCUMENT_TYPES, OTHER_DOCUMENT_TYPE } from "../../../../lib/document-types";
import { FilesPanel } from "../../../../components/files/FilesPanel";
import Image from "next/image";
import { AddTenancyModal } from "../../../../components/property/AddTenancyModal";

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
  const [mediaForUnit, setMediaForUnit] = useState<string | null>(null);

  // "Request from landlord" (C51): the form lives above the documents panel; the panel re-reads when a request is sent.
  const [requestOpen, setRequestOpen] = useState(false);
  const [filesKey, setFilesKey] = useState(0);
  const [filesInfo, setFilesInfo] = useState<{ photos: number; documents: number; cover: string | null }>({ photos: 0, documents: 0, cover: null });
  const [docType, setDocType] = useState<string>(PROPERTY_DOCUMENT_TYPES[0]);
  const [docOther, setDocOther] = useState("");
  const [docLandlord, setDocLandlord] = useState("");
  const [docBusy, setDocBusy] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  // Certificates: what THIS property is required to hold (same rule the
  // Paperwork matrix and compliance-watch use — one derivation, H3), each
  // addable/renewable right here. Insurance: a real add form. Both sections
  // used to be read-only "none on file yet" dead ends.
  interface PaperworkCell { name: string; certificateTypeId: string | null; status: string; expiresOn: string | null }
  const [required, setRequired] = useState<PaperworkCell[] | null>(null);
  const [certFor, setCertFor] = useState<string | null>(null);
  const [certIssued, setCertIssued] = useState("");
  const [certExpires, setCertExpires] = useState("");
  const [certBusy, setCertBusy] = useState(false);
  const [certError, setCertError] = useState<string | null>(null);
  const [addingPolicy, setAddingPolicy] = useState(false);
  const [polInsurer, setPolInsurer] = useState("");
  const [polRef, setPolRef] = useState("");
  const [polRenewal, setPolRenewal] = useState("");
  const [polPremium, setPolPremium] = useState("");
  const [polBusy, setPolBusy] = useState(false);
  const [polError, setPolError] = useState<string | null>(null);

  const loadRequired = useCallback(async () => {
    const res = await fetch("/api/paperwork");
    if (!res.ok) { setRequired([]); return; }
    const j = (await res.json()) as { rows?: Array<{ propertyId: string; cells: PaperworkCell[] }> };
    setRequired(j.rows?.find((r) => r.propertyId === id)?.cells ?? []);
  }, [id]);
  useEffect(() => { void loadRequired(); }, [loadRequired]);

  async function addCertificate(e: React.FormEvent, cell: PaperworkCell) {
    e.preventDefault();
    if (!cell.certificateTypeId) return;
    setCertBusy(true); setCertError(null);
    const res = await fetch("/api/certificates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_id: id, unit_id: null, certificate_type_id: cell.certificateTypeId, issued_on: certIssued || null, expires_on: certExpires || null, document_url: null }),
    });
    setCertBusy(false);
    if (!res.ok) { const b = await res.json().catch(() => null); setCertError(b?.issues?.[0]?.message ?? b?.error ?? "Could not save the certificate"); return; }
    setCertFor(null); setCertIssued(""); setCertExpires("");
    void loadRequired(); void load();
  }

  async function addPolicy(e: React.FormEvent) {
    e.preventDefault();
    setPolBusy(true); setPolError(null);
    const res = await fetch("/api/insurance/policies", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_id: id, insurer: polInsurer || null, policy_reference: polRef || null, renewal_date: polRenewal || null, annual_premium: polPremium ? Number(polPremium) : null, renewal_lead_days: 21 }),
    });
    setPolBusy(false);
    if (!res.ok) { const b = await res.json().catch(() => null); setPolError(b?.issues?.[0]?.message ?? b?.error ?? "Could not save the policy"); return; }
    setAddingPolicy(false); setPolInsurer(""); setPolRef(""); setPolRenewal(""); setPolPremium("");
    void load();
  }

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

  const resolvedDocType = docType === OTHER_DOCUMENT_TYPE ? docOther.trim() : docType;

  async function requestDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!resolvedDocType || !docLandlord) return;
    setDocBusy(true); setDocError(null);
    const res = await fetch("/api/property-documents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request", property_id: id, document_type: resolvedDocType, requested_from_landlord_id: docLandlord }),
    });
    setDocBusy(false);
    if (!res.ok) { const b = await res.json().catch(() => null); setDocError(b?.error ?? "Could not send the request"); return; }
    setRequestOpen(false); setDocOther(""); setDocLandlord("");
    setFilesKey((k) => k + 1);
  }

  // A requested document that arrived some other way (post, WhatsApp): attach it to the request by hand.
  async function attachReceivedFile(docId: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/property-documents/${docId}`, { method: "PATCH", body: form });
    if (!res.ok) { const b = await res.json().catch(() => null); throw new Error(b?.error ?? "Could not attach the file"); }
  }

  if (error) return <div style={{ padding: "1.75rem" }}><p style={{ color: "var(--brick)" }}>{error}</p></div>;
  if (!data) return <div style={{ padding: "1.75rem" }}><p className="muted">Loading…</p></div>;

  const { property, units, certificates, policies } = data;

  return (
    <div style={{ padding: "1.75rem", maxWidth: 820 }}>
      <div className="ch" style={{ padding: 0, marginBottom: 6, border: "none", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          {filesInfo.cover && (
            <div style={{ position: "relative", width: 64, height: 64, borderRadius: 12, overflow: "hidden", flex: "none", boxShadow: "0 1px 3px rgba(15,28,46,.18)" }}>
              <Image src={filesInfo.cover} alt="" fill sizes="64px" style={{ objectFit: "cover" }} unoptimized />
            </div>
          )}
          <h1 style={{ margin: 0 }}>{property.name}</h1>
        </div>
        <Link href={`/properties/${id}/print`} className="btn ghost sm" target="_blank">Print QR</Link>
      </div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
        {[property.address_line1, property.city, property.postcode].filter(Boolean).join(", ") || "No address on file yet"}
        {(filesInfo.photos > 0 || filesInfo.documents > 0) && <> · {filesInfo.photos} photo{filesInfo.photos === 1 ? "" : "s"} · {filesInfo.documents} document{filesInfo.documents === 1 ? "" : "s"}</>}
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
            <Link href={`/landlords/${data.landlord.id}`} className="li row" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", width: "100%", boxSizing: "border-box", alignItems: "center" }}>
              <span className="avatar" aria-hidden="true" style={{ background: "var(--navy)", color: "#fff" }}>{data.landlord.name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
              <div className="body">
                <b>{data.landlord.name}</b>
                <p>{[data.landlord.contact_phone, data.landlord.contact_email].filter(Boolean).join(" · ") || "No contact details on file yet"} · open profile</p>
              </div>
              <span className="chev">›</span>
            </Link>
          )}
        </div>
      </section>

      <FilesPanel entity="property" id={id} mode="photos" title="Photos" refreshKey={filesKey}
        onChanged={(r) => setFilesInfo((f) => ({ ...f, photos: r.counts.photos, cover: r.items.find((x) => x.kind === "photo" && x.isCover)?.thumbUrl ?? r.items.find((x) => x.kind === "photo")?.thumbUrl ?? null }))} />

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="ch"><h3>Rooms</h3>
          <button type="button" className="btn ghost sm" onClick={() => setAddingRoom((v) => !v)}>{addingRoom ? "Cancel" : "Add room"}</button>
        </div>
        {addingRoom && (
          <form onSubmit={addRoom} className="li" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ flex: 1, minWidth: 140 }}><span className="lbl">Room</span>
                <input value={roomRef} onChange={(e) => setRoomRef(e.target.value)} required placeholder="Room 4" style={inp} /></label>
              {/* Room type stays "supported" — "remove residential and commercial"
                  (walkthrough 2026-10-09). The field is kept in state so the
                  enum can be exposed again without touching the save path. */}
              <input type="hidden" value={roomClass} readOnly onChange={(e) => setRoomClass(e.target.value)} />
            </div>
            {roomError && <p style={{ color: "var(--brick)", fontSize: 13, margin: 0 }}>{roomError}</p>}
            <div><button type="submit" className="rel" disabled={roomBusy || !roomRef.trim()}>{roomBusy ? "Adding…" : "Add room"}</button></div>
          </form>
        )}
        {units.length === 0 && !addingRoom ? (
          <div className="li"><div className="body"><b>No rooms yet</b><p>Add the first one above.</p></div></div>
        ) : (
          units.map((u) => (
            <div key={u.id}>
              <div className="li">
                <div className="body">
                  <b>{u.reference}</b>
                  <p>
                    {u.tenancy ? (
                      <>
                        <Link href={`/tenants/${u.tenancy.tenant_id}`} style={{ color: "var(--navy)", fontWeight: 600, textDecoration: "underline" }}>
                          {u.tenancy.tenants?.full_name ?? "Tenant"}
                        </Link>
                        {` · ${formatMoney(u.tenancy.rent_amount)} ${u.tenancy.rent_frequency}`}
                      </>
                    ) : "Vacant"}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn ghost sm" onClick={() => setMediaForUnit(mediaForUnit === u.id ? null : u.id)}>
                    {mediaForUnit === u.id ? "Hide photos" : "Photos"}
                  </button>
                  {!u.tenancy && (
                    <button type="button" className="btn ghost sm" onClick={() => setTenancyForUnit(u.id)}>Add tenancy</button>
                  )}
                </div>
              </div>
              {mediaForUnit === u.id && (
                <div style={{ padding: "0 16px 16px" }}>
                  <FilesPanel entity="unit" id={u.id} mode="photos" title={`${u.reference} photos`} />
                </div>
              )}
            </div>
          ))
        )}
      </section>

      {tenancyForUnit && (
        <AddTenancyModal
          open
          onClose={() => setTenancyForUnit(null)}
          onCreated={() => void load()}
          unitId={tenancyForUnit}
          roomReference={units.find((u) => u.id === tenancyForUnit)?.reference ?? ""}
          address={[property.address_line1, property.city].filter(Boolean).join(", ") || property.name}
          postcode={property.postcode ?? ""}
        />
      )}

      <FilesPanel entity="property" id={id} mode="documents" title="Documents" refreshKey={filesKey}
        onChanged={(r) => setFilesInfo((f) => ({ ...f, documents: r.counts.documents }))}
        extraActions={<button type="button" className="btn ghost sm" onClick={() => setRequestOpen((v) => !v)}>{requestOpen ? "Cancel request" : "Request from landlord"}</button>}
        onAttachRequested={(f, file) => attachReceivedFile(f.id, file)}
        below={requestOpen ? (
          <form onSubmit={requestDocument} className="li" style={{ display: "grid", gap: 10, background: "var(--cream)" }}>
            <p style={{ margin: 0, fontSize: 13 }}>The landlord gets an email with a one-time upload link — no account needed. When they use it, the file lands here on its own.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <select value={docType} onChange={(e) => setDocType(e.target.value)} style={inp}>
                {PROPERTY_DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value={OTHER_DOCUMENT_TYPE}>{OTHER_DOCUMENT_TYPE}</option>
              </select>
              {docType === OTHER_DOCUMENT_TYPE && <input value={docOther} onChange={(e) => setDocOther(e.target.value)} placeholder="Describe it" style={inp} />}
              <select value={docLandlord} onChange={(e) => setDocLandlord(e.target.value)} required style={inp}>
                <option value="">Which landlord?</option>
                {landlordOptions.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            {docError && <p style={{ color: "var(--brick)", fontSize: 13, margin: 0 }}>{docError}</p>}
            <div><button type="submit" className="rel sm" disabled={docBusy || !docLandlord}>{docBusy ? "Sending…" : "Send request"}</button></div>
          </form>
        ) : null}
      />

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="ch"><h3>Certificates</h3><span className="muted">What this property must hold, by law</span></div>
        {required === null ? (
          <div className="li"><p className="muted">Checking what&apos;s required…</p></div>
        ) : required.length === 0 ? (
          <div className="li"><p className="muted">Nothing required until this property has at least one room with a type.</p></div>
        ) : (
          required.map((cell) => {
            const tone = cell.status === "valid" ? "var(--live)" : cell.status === "missing" || cell.status === "expired" ? "var(--brick)" : "var(--amber-deep)";
            const open = certFor === cell.name;
            return (
              <div key={cell.name}>
                <div className="li">
                  <div className="body">
                    <b>{cell.name}</b>
                    <p><span style={{ color: tone, fontWeight: 600, textTransform: "capitalize" }}>{cell.status.replace(/_/g, " ")}</span>{cell.expiresOn ? ` · expires ${formatShortDate(cell.expiresOn)}` : ""}</p>
                  </div>
                  <button type="button" className="btn ghost sm" disabled={!cell.certificateTypeId}
                    title={cell.certificateTypeId ? undefined : "This certificate type isn't in the catalogue yet"}
                    onClick={() => { setCertFor(open ? null : cell.name); setCertError(null); }}>
                    {open ? "Cancel" : cell.status === "valid" ? "Renew" : "Add"}
                  </button>
                </div>
                {open && (
                  <form onSubmit={(e) => void addCertificate(e, cell)} className="li" style={{ display: "grid", gap: 10, background: "var(--cream)" }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <label style={{ flex: 1, minWidth: 140 }}><span className="lbl">Issued on</span>
                        <input type="date" value={certIssued} onChange={(e) => setCertIssued(e.target.value)} required style={inp} /></label>
                      <label style={{ flex: 1, minWidth: 140 }}><span className="lbl">Expires on</span>
                        <input type="date" value={certExpires} onChange={(e) => setCertExpires(e.target.value)} required style={inp} /></label>
                    </div>
                    {certError && <p style={{ color: "var(--brick)", fontSize: 13, margin: 0 }}>{certError}</p>}
                    <div><button type="submit" className="rel sm" disabled={certBusy || !certIssued || !certExpires}>{certBusy ? "Saving…" : `Save ${cell.name}`}</button></div>
                  </form>
                )}
              </div>
            );
          })
        )}
        {certificates.length > 0 && (
          <details className="li" style={{ display: "block" }}>
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>History ({certificates.length} on file)</summary>
            <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
              {certificates.map((c) => (
                <p key={c.id} style={{ margin: 0, fontSize: 13, color: "var(--slate)" }}>
                  <b>{c.certificate_types?.name ?? "Certificate"}</b> · {c.issued_on ? `issued ${formatShortDate(c.issued_on)}` : "issue date not on file"} · {c.expires_on ? `expires ${formatShortDate(c.expires_on)}` : "no expiry on file"}
                </p>
              ))}
            </div>
          </details>
        )}
      </section>

      <section className="card">
        <div className="ch"><h3>Insurance</h3>
          <button type="button" className="btn ghost sm" onClick={() => { setAddingPolicy((v) => !v); setPolError(null); }}>{addingPolicy ? "Cancel" : "Add policy"}</button>
        </div>
        {addingPolicy && (
          <form onSubmit={addPolicy} className="li" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ flex: 1, minWidth: 160 }}><span className="lbl">Insurer</span>
                <input value={polInsurer} onChange={(e) => setPolInsurer(e.target.value)} required placeholder="e.g. Aviva" style={inp} /></label>
              <label style={{ flex: 1, minWidth: 160 }}><span className="lbl">Policy reference</span>
                <input value={polRef} onChange={(e) => setPolRef(e.target.value)} placeholder="Optional" style={inp} /></label>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ flex: 1, minWidth: 160 }}><span className="lbl">Renewal date</span>
                <input type="date" value={polRenewal} onChange={(e) => setPolRenewal(e.target.value)} required style={inp} /></label>
              <label style={{ flex: 1, minWidth: 160 }}><span className="lbl">Annual premium (£)</span>
                <input type="number" min="0" step="0.01" value={polPremium} onChange={(e) => setPolPremium(e.target.value)} placeholder="Optional" style={inp} /></label>
            </div>
            {polError && <p style={{ color: "var(--brick)", fontSize: 13, margin: 0 }}>{polError}</p>}
            <div><button type="submit" className="rel sm" disabled={polBusy || !polInsurer.trim() || !polRenewal}>{polBusy ? "Saving…" : "Save policy"}</button></div>
          </form>
        )}
        {policies.length === 0 && !addingPolicy ? (
          <div className="li"><div className="body"><b>No policy on file yet</b><p>Add one above — the insurance-renewal agent watches the renewal date and gathers quotes before it lapses.</p></div></div>
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
