/**
 * Landlords — everyone we manage property for in THIS workspace, each a
 * link to their profile. Managing agents (Matty's Place, Reliance…) are
 * workspaces, not landlords, so they never appear here by construction.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../contexts/AuthContext";

interface Landlord { id: string; name: string; contact_email: string | null; contact_phone: string | null }
interface Property { id: string; landlord_id: string | null; unitsCount: number; occupiedCount: number }

export default function LandlordsPage() {
  const { profile } = useAuth();
  const [landlords, setLandlords] = useState<Landlord[] | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    Promise.all([fetch("/api/landlords").then((r) => (r.ok ? r.json() : [])), fetch("/api/properties").then((r) => (r.ok ? r.json() : []))])
      .then(([l, p]) => { setLandlords(Array.isArray(l) ? l : []); setProperties(Array.isArray(p) ? p : []); })
      .catch(() => setLandlords([]));
  }, []);

  const perLandlord = useMemo(() => {
    const m = new Map<string, { props: number; rooms: number; filled: number }>();
    for (const p of properties) {
      if (!p.landlord_id) continue;
      const c = m.get(p.landlord_id) ?? { props: 0, rooms: 0, filled: 0 };
      c.props += 1; c.rooms += p.unitsCount; c.filled += p.occupiedCount;
      m.set(p.landlord_id, c);
    }
    return m;
  }, [properties]);

  const list = (landlords ?? []).filter((l) => !q || `${l.name} ${l.contact_email ?? ""} ${l.contact_phone ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div style={{ padding: "1.75rem", maxWidth: 820 }}>
      <div className="ch" style={{ padding: 0, marginBottom: 6, border: "none", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ margin: 0 }}>Landlords</h1>
        <Link href="/properties?addLandlord=1" className="rel">+ Add landlord</Link>
      </div>
      <p className="sub">Everyone {profile?.org_name ?? "this workspace"} manages property for. Click a name for their profile and all their properties.</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email or phone…" style={{ ...inp, marginBottom: 14 }} />
      <section className="card">
        {landlords === null ? <div className="li"><p className="muted">Loading…</p></div>
          : list.length === 0 ? <div className="li"><div className="body"><b>{q ? "Nothing matches" : "No landlords yet"}</b><p>{q ? "Try another name." : "Add the first one — properties can be put under them straight away."}</p></div></div>
          : list.map((l) => {
            const c = perLandlord.get(l.id);
            return (
              <Link key={l.id} href={`/landlords/${l.id}`} className="li row">
                <span className="avatar" aria-hidden="true" style={{ background: "var(--navy)", color: "#fff" }}>{l.name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
                <div className="body">
                  <b>{l.name}</b>
                  <p>{[l.contact_phone, l.contact_email].filter(Boolean).join(" · ") || "No contact details yet"} · {c ? `${c.props} propert${c.props === 1 ? "y" : "ies"} · ${c.filled} of ${c.rooms} rooms filled` : "No properties yet"}</p>
                </div>
                <span className="chev">›</span>
              </Link>
            );
          })}
      </section>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
