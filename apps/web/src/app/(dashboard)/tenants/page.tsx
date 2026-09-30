/**
 * People — every tenant, red/orange/green by housing benefit risk, one card
 * per person. Rebuilt onto the console design system (globals.css's card/li/
 * tag classes) so this matches Today, Properties and Rent instead of the
 * inline-styled table it used to be. Filtering and sort logic is unchanged.
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { useTenants } from "../../../hooks/useTenants";
import { HandoverPanel } from "../../../components/HandoverPanel";

const HB_TAG: Record<string, { color: string; bg: string; label: string }> = {
  active: { color: "var(--live)", bg: "rgba(46,158,107,.12)", label: "HB active" },
  suspended: { color: "var(--brick)", bg: "rgba(178,74,49,.12)", label: "HB suspended" },
  in_progress: { color: "var(--amber-deep)", bg: "rgba(232,168,76,.16)", label: "HB in progress" },
};

const BRAND_LABEL: Record<string, string> = { mattys_place: "Matty's Place", reliance: "Reliance Housing" };

/** The house, however the record has it. address is the specific ask — "which
 *  house" — but it's an optional field a lot of real tenant records never had
 *  filled in; the brand (always set) means this is never blank. */
function homeLabel(address: string | null | undefined, brand: string | null | undefined): string | null {
  if (address) return address;
  if (brand) return BRAND_LABEL[brand] ?? brand;
  return null;
}

export default function TenantsIndexPage() {
  const { tenants, loading, error } = useTenants();
  const [filter, setFilter] = useState<"all" | "active" | "in_progress" | "suspended">("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");

  const filteredTenants = tenants
    .filter((t) => filter === "all" || t.housing_benefit_status === filter)
    .filter((t) => brandFilter === "all" || t.brand === brandFilter)
    .sort((a, b) => {
      const order = { suspended: 0, in_progress: 1, active: 2 };
      const aVal = order[a.housing_benefit_status as keyof typeof order] ?? 3;
      const bVal = order[b.housing_benefit_status as keyof typeof order] ?? 3;
      if (aVal !== bVal) return aVal - bVal;
      return a.full_name.localeCompare(b.full_name);
    });

  return (
    <div style={{ padding: "1.75rem", maxWidth: 900 }}>
      <HandoverPanel />

      <div className="ch" style={{ padding: 0, marginBottom: 18, border: "none" }}>
        <h1 style={{ margin: 0 }}>People</h1>
        <Link href="/intake/new" className="rel">+ New tenant</Link>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, alignItems: "center" }}>
        {(["all", "suspended", "in_progress", "active"] as const).map((f) => (
          <button key={f} type="button" className={filter === f ? "btn sm" : "btn ghost sm"} onClick={() => setFilter(f)}>
            {f === "all" ? "All tenants" : f === "suspended" ? "At financial risk" : f === "in_progress" ? "Housing benefit in progress" : "Active"}
          </button>
        ))}
        <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="btn ghost sm" style={{ marginLeft: "auto", cursor: "pointer" }}>
          <option value="all">All HMOs / brands</option>
          <option value="mattys_place">Matty&apos;s Place</option>
          <option value="reliance">Reliance Housing</option>
        </select>
      </div>

      <section className="card">
        {loading ? (
          <div className="li"><p className="muted">Loading…</p></div>
        ) : error ? (
          <div className="li"><div className="body"><b>Couldn&apos;t load people</b><p>{error}</p></div></div>
        ) : filteredTenants.length === 0 ? (
          <div className="li"><p className="muted">No one matches this filter.</p></div>
        ) : (
          filteredTenants.map((t) => {
            const hb = t.housing_benefit_status ? HB_TAG[t.housing_benefit_status] : null;
            return (
              <Link href={`/tenants/${t.id}`} key={t.id} className="li row" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="body">
                  <b>{t.full_name}</b>
                  <p>
                    {[homeLabel(t.address, t.brand), t.room_number ? `Room ${t.room_number}` : null].filter(Boolean).join(" · ") || "No home on file"}
                    {" · "}<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t.nino || "no NINO on file"}</span>
                  </p>
                </div>
                <div className="btns" style={{ marginLeft: "auto" }}>
                  {!t.is_active && <span className="tag" style={{ background: "rgba(92,102,115,.12)", color: "var(--slate)" }}>Inactive</span>}
                  {hb && <span className="tag" style={{ background: hb.bg, color: hb.color }}>{hb.label}</span>}
                </div>
              </Link>
            );
          })
        )}
      </section>
    </div>
  );
}
