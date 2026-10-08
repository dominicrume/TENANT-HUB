/**
 * Properties — every property, with a certificate and arrears summary per one
 * (BUILD_PLAN C29, renamed from "Homes" at C45 per the client's own repeated
 * correction: "instead of home, put a property"). "Add property" from the
 * empty state or the header; no manual needed.
 *
 * C46/C47 (M8 — Properties refinement, docs/PROPERTIES_REFINEMENT.md): who
 * owns a property is now a real, addable list (packages/validation's
 * LandlordSchema, table `landlords`) — not the old fixed 2-brand setup in
 * BrandContext. The landlord dropdown below is built from that real list, so
 * adding a landlord here makes it selectable immediately, with no code change.
 * C48: the search box filters by address/postcode across every landlord.
 * C49: Active/Pending status comes from the API (same required-certificate
 * rule the Paperwork matrix uses, H3) — Pending always says what's missing.
 * C52: "Room status" view — filled vs empty rooms per property, coloured by
 * landlord, with totals across every landlord in one place.
 *
 * Governed by docs/ESTATE_OPS_INTEGRATION_PROMPT.md §5#21.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PostcodeField } from "../../../components/PostcodeField";

interface Property {
  id: string; name: string; address_line1: string | null; city: string | null; postcode: string | null;
  asset_class: "supported" | "residential" | "commercial" | "mixed";
  landlord_id: string | null; landlordName: string | null;
  unitsCount: number; occupiedCount: number; openAlerts: number; arrearsCount: number;
  status: "active" | "pending"; pendingReasons: string[];
}
interface Landlord { id: string; name: string; contact_email: string | null; contact_phone: string | null }

const TAG_CLASS: Record<Property["asset_class"], string> = { supported: "sup", residential: "res", commercial: "com", mixed: "both" };
const TAG_LABEL: Record<Property["asset_class"], string> = { supported: "Supported", residential: "Residential", commercial: "Commercial", mixed: "Mixed" };

// A stable colour per landlord (C52). Cycles through the brand palette rather
// than inventing new hex values — picked by position in the landlord list
// (already name-sorted by the API), so the same landlord keeps the same
// colour across a session even as others are added.
const LANDLORD_PALETTE = ["var(--amber-deep)", "var(--live)", "var(--violet)", "var(--brick)", "var(--navy)", "var(--slate)"];
const UNASSIGNED_COLOR = "var(--line)";

export default function PropertiesPage() {
  const searchParams = useSearchParams();
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [postcode, setPostcode] = useState("");
  const [assetClass, setAssetClass] = useState<Property["asset_class"]>("supported");
  const [landlordId, setLandlordId] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [view, setView] = useState<"list" | "rooms">("list");

  // Filter + search
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "pending">("all");
  const [landlordFilter, setLandlordFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Add-landlord panel
  const [showAddLandlord, setShowAddLandlord] = useState(false);
  const [llName, setLlName] = useState("");
  const [llEmail, setLlEmail] = useState("");
  const [llPhone, setLlPhone] = useState("");
  const [llBusy, setLlBusy] = useState(false);
  const [llError, setLlError] = useState<string | null>(null);

  // The dashboard's "+ Add landlord" button links here with ?addLandlord=1
  // rather than duplicating this form — one form, one source of truth (H8).
  useEffect(() => {
    if (searchParams.get("addLandlord") === "1") setShowAddLandlord(true);
  }, [searchParams]);

  const load = useCallback(async () => {
    const [pRes, lRes] = await Promise.all([fetch("/api/properties"), fetch("/api/landlords")]);
    if (!pRes.ok) { const b = await pRes.json().catch(() => null); setError(b?.error ?? `${pRes.status} ${pRes.statusText}`); return; }
    setProperties(await pRes.json());
    if (lRes.ok) setLandlords(await lRes.json());
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function addProperty(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setSaveError(null);
    const res = await fetch("/api/properties", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, address_line1: address || null, postcode: postcode || null, asset_class: assetClass, landlord_id: landlordId || null }),
    });
    setBusy(false);
    if (!res.ok) { const b = await res.json().catch(() => null); setSaveError(b?.error ?? "Could not add the property"); return; }
    setName(""); setAddress(""); setPostcode(""); setAssetClass("supported"); setLandlordId(""); setAdding(false);
    void load();
  }

  async function addLandlord(e: React.FormEvent) {
    e.preventDefault();
    if (!llName.trim()) return;
    setLlBusy(true); setLlError(null);
    const res = await fetch("/api/landlords", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: llName, contact_email: llEmail || null, contact_phone: llPhone || null }),
    });
    setLlBusy(false);
    if (!res.ok) { const b = await res.json().catch(() => null); setLlError(b?.error ?? "Could not add the landlord"); return; }
    setLlName(""); setLlEmail(""); setLlPhone(""); setShowAddLandlord(false);
    void load(); // properties list stays populated with the old data until this resolves (H8)
  }

  const filtered = useMemo(() => {
    let list = properties ?? [];
    if (statusFilter !== "all") list = list.filter((p) => p.status === statusFilter);
    if (landlordFilter === "unassigned") list = list.filter((p) => !p.landlord_id);
    else if (landlordFilter !== "all") list = list.filter((p) => p.landlord_id === landlordFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => [p.name, p.address_line1, p.city, p.postcode].filter(Boolean).join(" ").toLowerCase().includes(q));
    return list;
  }, [properties, statusFilter, landlordFilter, search]);

  const activeCount = (properties ?? []).filter((p) => p.status === "active").length;
  const pendingCount = (properties ?? []).filter((p) => p.status === "pending").length;
  const none = properties !== null && properties.length === 0;

  const landlordColor = useMemo(() => {
    const m = new Map<string, string>();
    landlords.forEach((l, i) => m.set(l.id, LANDLORD_PALETTE[i % LANDLORD_PALETTE.length] ?? UNASSIGNED_COLOR));
    return m;
  }, [landlords]);

  const roomTotals = useMemo(() => {
    const totals = new Map<string, { name: string; color: string; filled: number; empty: number }>();
    for (const p of filtered) {
      const key = p.landlord_id ?? "unassigned";
      const cur = totals.get(key) ?? { name: p.landlordName ?? "Unassigned", color: p.landlord_id ? (landlordColor.get(p.landlord_id) ?? UNASSIGNED_COLOR) : UNASSIGNED_COLOR, filled: 0, empty: 0 };
      cur.filled += p.occupiedCount;
      cur.empty += p.unitsCount - p.occupiedCount;
      totals.set(key, cur);
    }
    return [...totals.values()];
  }, [filtered, landlordColor]);

  return (
    <div style={{ padding: "1.75rem", maxWidth: 820 }}>
      <div className="ch" style={{ padding: 0, marginBottom: 18, border: "none", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ margin: 0 }}>Properties</h1>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="btn ghost sm" onClick={() => setView((v) => (v === "list" ? "rooms" : "list"))}>{view === "list" ? "Room status" : "Back to list"}</button>
          <button type="button" className="btn ghost sm" onClick={() => setShowAddLandlord((v) => !v)}>{showAddLandlord ? "Cancel" : "Add landlord"}</button>
          <button type="button" className="rel" onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "Add property"}</button>
        </div>
      </div>

      {properties !== null && properties.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {(["all", "active", "pending"] as const).map((s) => (
              <button
                key={s} type="button" onClick={() => setStatusFilter(s)}
                className={statusFilter === s ? "rel sm" : "btn ghost sm"}
              >
                {s === "all" ? `All (${properties.length})` : s === "active" ? `Active (${activeCount})` : `Pending (${pendingCount})`}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
            <select value={landlordFilter} onChange={(e) => setLandlordFilter(e.target.value)} style={{ ...inp, width: "auto", minWidth: 180 }}>
              <option value="all">All landlords</option>
              <option value="unassigned">Unassigned</option>
              {landlords.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by address or postcode…" style={{ ...inp, flex: 1, minWidth: 220 }} />
          </div>
        </>
      )}

      {showAddLandlord && (
        <form onSubmit={addLandlord} className="card" style={{ marginBottom: 18, padding: 18, display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Add landlord</h3>
          <label><span className="lbl">Name</span>
            <input value={llName} onChange={(e) => setLlName(e.target.value)} required placeholder="e.g. Clyde Porter, or the housing association's name" style={inp} /></label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ flex: 1, minWidth: 160 }}><span className="lbl">Contact email</span>
              <input type="email" value={llEmail} onChange={(e) => setLlEmail(e.target.value)} placeholder="Optional" style={inp} /></label>
            <label style={{ flex: 1, minWidth: 160 }}><span className="lbl">Contact phone</span>
              <input value={llPhone} onChange={(e) => setLlPhone(e.target.value)} placeholder="Optional" style={inp} /></label>
          </div>
          {llError && <p style={{ color: "var(--brick)", fontSize: 13, margin: 0 }}>{llError}</p>}
          <div><button type="submit" className="rel" disabled={llBusy || !llName.trim()}>{llBusy ? "Adding…" : "Add landlord"}</button></div>
        </form>
      )}

      {adding && (
        <form onSubmit={addProperty} className="card" style={{ marginBottom: 18, padding: 18, display: "grid", gap: 10 }}>
          <label><span className="lbl">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="14 Ravenhurst Street" style={inp} /></label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ flex: 1, minWidth: 160 }}><span className="lbl">Address</span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" style={inp} /></label>
            <label style={{ flex: 1, minWidth: 120 }}><span className="lbl">Postcode</span>
              <PostcodeField value={postcode} onChange={setPostcode} style={inp} /></label>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ flex: 1, minWidth: 160 }}><span className="lbl">Type</span>
              <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as Property["asset_class"])} style={inp}>
                <option value="supported">Supported</option><option value="residential">Residential</option>
                <option value="commercial">Commercial</option><option value="mixed">Mixed</option>
              </select></label>
            <label style={{ flex: 1, minWidth: 160 }}><span className="lbl">Landlord</span>
              <select value={landlordId} onChange={(e) => setLandlordId(e.target.value)} style={inp}>
                <option value="">Not set yet</option>
                {landlords.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></label>
          </div>
          {saveError && <p style={{ color: "var(--brick)", fontSize: 13, margin: 0 }}>{saveError}</p>}
          <div><button type="submit" className="rel" disabled={busy || !name.trim()}>{busy ? "Adding…" : "Add property"}</button></div>
        </form>
      )}

      {view === "rooms" && properties !== null && properties.length > 0 && (
        <section className="card" style={{ marginBottom: 18, padding: 18 }}>
          <h3 style={{ marginTop: 0 }}>Room status</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Filled vs empty rooms, one bar per property, coloured by landlord. Respects the filters above.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
            {roomTotals.map((t) => (
              <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: t.color, display: "inline-block" }} />
                <b>{t.name}</b><span className="muted">· {t.filled} filled, {t.empty} empty</span>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((p) => {
              const color = p.landlord_id ? (landlordColor.get(p.landlord_id) ?? UNASSIGNED_COLOR) : UNASSIGNED_COLOR;
              const pct = p.unitsCount > 0 ? Math.round((p.occupiedCount / p.unitsCount) * 100) : 0;
              return (
                <div key={p.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                    <span><b>{p.name}</b> <span className="muted">· {p.landlordName ?? "Unassigned"}</span></span>
                    <span className="muted">{p.occupiedCount} filled, {p.unitsCount - p.occupiedCount} empty</span>
                  </div>
                  <div style={{ height: 10, borderRadius: 5, background: "var(--cream)", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {view === "list" && (
      <section className="card">
        {error ? (
          <div className="li"><div className="body"><b>Couldn&apos;t load properties</b><p>{error}</p></div></div>
        ) : properties === null ? (
          <div className="li"><p className="muted">Loading…</p></div>
        ) : none ? (
          <div className="li"><div className="body"><b>No properties yet</b><p>Add the first one above. Three fields is all it takes.</p></div></div>
        ) : filtered.length === 0 ? (
          <div className="li"><div className="body"><b>Nothing matches</b><p>Try a different landlord or search term.</p></div></div>
        ) : (
          filtered.map((p) => (
            <Link href={`/properties/${p.id}`} key={p.id} className="li row" style={{ textDecoration: "none", color: "inherit" }}>
              <span className={`tag ${TAG_CLASS[p.asset_class]}`} style={{ marginTop: 3 }}>{TAG_LABEL[p.asset_class]}</span>
              <div className="body">
                <b>{p.name}</b>
                <p>
                  {p.address_line1 ? `${p.address_line1}${p.postcode ? `, ${p.postcode}` : ""} · ` : ""}
                  {p.occupiedCount} of {p.unitsCount} rooms occupied
                  {p.openAlerts > 0 ? ` · ${p.openAlerts} certificate${p.openAlerts === 1 ? "" : "s"} to sort` : ""}
                  {p.arrearsCount > 0 ? ` · ${p.arrearsCount} tenanc${p.arrearsCount === 1 ? "y" : "ies"} behind` : ""}
                  {p.landlordName ? ` · ${p.landlordName}` : " · Landlord not set"}
                </p>
                {p.status === "pending" && (
                  <p style={{ color: "var(--amber-deep)", fontWeight: 600, margin: "2px 0 0" }}>
                    Pending · {p.pendingReasons.join(", ")}
                  </p>
                )}
              </div>
            </Link>
          ))
        )}
      </section>
      )}
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
