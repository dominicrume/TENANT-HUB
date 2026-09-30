/**
 * Properties — every property, with a certificate and arrears summary per one
 * (BUILD_PLAN C29, renamed from "Homes" at C45 per the client's own repeated
 * correction: "instead of home, put a property"). "Add property" from the
 * empty state or the header; no manual needed.
 * Governed by docs/ESTATE_OPS_INTEGRATION_PROMPT.md §5#21.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Property {
  id: string; name: string; address_line1: string | null; city: string | null; postcode: string | null;
  asset_class: "supported" | "residential" | "commercial" | "mixed";
  unitsCount: number; occupiedCount: number; openAlerts: number; arrearsCount: number;
}

const TAG_CLASS: Record<Property["asset_class"], string> = { supported: "sup", residential: "res", commercial: "com", mixed: "both" };
const TAG_LABEL: Record<Property["asset_class"], string> = { supported: "Supported", residential: "Residential", commercial: "Commercial", mixed: "Mixed" };

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [postcode, setPostcode] = useState("");
  const [assetClass, setAssetClass] = useState<Property["asset_class"]>("supported");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/properties");
    if (!res.ok) { const b = await res.json().catch(() => null); setError(b?.error ?? `${res.status} ${res.statusText}`); return; }
    setProperties(await res.json());
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function addProperty(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setSaveError(null);
    const res = await fetch("/api/properties", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, address_line1: address || null, postcode: postcode || null, asset_class: assetClass }),
    });
    setBusy(false);
    if (!res.ok) { const b = await res.json().catch(() => null); setSaveError(b?.error ?? "Could not add the property"); return; }
    setName(""); setAddress(""); setPostcode(""); setAssetClass("supported"); setAdding(false);
    void load();
  }

  const none = properties !== null && properties.length === 0;

  return (
    <div style={{ padding: "1.75rem", maxWidth: 820 }}>
      <div className="ch" style={{ padding: 0, marginBottom: 18, border: "none" }}>
        <h1 style={{ margin: 0 }}>Properties</h1>
        <button type="button" className="rel" onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "Add property"}</button>
      </div>

      {adding && (
        <form onSubmit={addProperty} className="card" style={{ marginBottom: 18, padding: 18, display: "grid", gap: 10 }}>
          <label><span className="lbl">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="14 Ravenhurst Street" style={inp} /></label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ flex: 1, minWidth: 160 }}><span className="lbl">Address</span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" style={inp} /></label>
            <label style={{ flex: 1, minWidth: 120 }}><span className="lbl">Postcode</span>
              <input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="Optional" style={inp} /></label>
          </div>
          <label><span className="lbl">Type</span>
            <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as Property["asset_class"])} style={inp}>
              <option value="supported">Supported</option><option value="residential">Residential</option>
              <option value="commercial">Commercial</option><option value="mixed">Mixed</option>
            </select></label>
          {saveError && <p style={{ color: "var(--brick)", fontSize: 13, margin: 0 }}>{saveError}</p>}
          <div><button type="submit" className="rel" disabled={busy || !name.trim()}>{busy ? "Adding…" : "Add property"}</button></div>
        </form>
      )}

      <section className="card">
        {error ? (
          <div className="li"><div className="body"><b>Couldn&apos;t load properties</b><p>{error}</p></div></div>
        ) : properties === null ? (
          <div className="li"><p className="muted">Loading…</p></div>
        ) : none ? (
          <div className="li"><div className="body"><b>No properties yet</b><p>Add the first one above — three fields is all it takes.</p></div></div>
        ) : (
          properties.map((p) => (
            <Link href={`/properties/${p.id}`} key={p.id} className="li row" style={{ textDecoration: "none", color: "inherit" }}>
              <span className={`tag ${TAG_CLASS[p.asset_class]}`} style={{ marginTop: 3 }}>{TAG_LABEL[p.asset_class]}</span>
              <div className="body">
                <b>{p.name}</b>
                <p>
                  {p.address_line1 ? `${p.address_line1}${p.postcode ? `, ${p.postcode}` : ""} · ` : ""}
                  {p.occupiedCount} of {p.unitsCount} rooms occupied
                  {p.openAlerts > 0 ? ` · ${p.openAlerts} certificate${p.openAlerts === 1 ? "" : "s"} to sort` : ""}
                  {p.arrearsCount > 0 ? ` · ${p.arrearsCount} tenanc${p.arrearsCount === 1 ? "y" : "ies"} behind` : ""}
                </p>
              </div>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
