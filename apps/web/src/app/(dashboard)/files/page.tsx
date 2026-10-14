/**
 * Files — the manager's view of every photo and document across the estate
 * (docs/FILES_SPEC.md §2.5): how much is stored, by landlord, what is
 * MISSING (required documents not yet filed, per tenant / property /
 * landlord), what arrived recently, and which share links are live.
 */
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatDateTime, formatShortDate } from "../../../lib/format";
import { fileIcon, formatBytes } from "../../../components/files/upload";

interface Overview {
  totals: { files: number; photos: number; documents: number; bytes: number };
  byLandlord: Array<{ landlordId: string | null; landlord: string; properties: number; photos: number; documents: number; bytes: number }>;
  recent: Array<{ kind: "photo" | "document"; name: string; where: string; whereHref: string; uploadedBy: string | null; createdAt: string; blobId: string | null; hasThumb: boolean; mimeType: string | null }>;
  missing: { tenants: Array<{ id: string; name: string; room: string | null; missing: string[] }>; properties: Array<{ id: string; name: string; missing: string[] }>; landlords: Array<{ id: string; name: string; missing: string[] }> };
  shares: Array<{ id: string; label: string | null; fileName: string; expiresAt: string; createdBy: string; openCount: number; lastOpenedAt: string | null }>;
}

export default function FilesPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"missing" | "recent" | "shares">("missing");

  async function load() {
    try {
      const r = await fetch("/api/files/overview");
      if (!r.ok) { const b = await r.json().catch(() => null); setError(b?.error ?? "Couldn't load"); return; }
      setData(await r.json());
    } catch { setError("Could not reach the server."); }
  }
  useEffect(() => { void load(); }, []);

  async function revoke(id: string) {
    if (!window.confirm("Withdraw this link? Anyone holding it will get 'expired' from now on.")) return;
    await fetch(`/api/files/share?id=${id}`, { method: "DELETE" });
    await load();
  }

  if (error) return <div style={{ padding: "1.75rem" }}><p style={{ color: "var(--brick)" }}>{error}</p></div>;
  if (!data) return <div style={{ padding: "1.75rem" }}><p className="muted">Counting the files…</p></div>;
  const gaps = data.missing.tenants.length + data.missing.properties.length + data.missing.landlords.length;

  return (
    <div style={{ padding: "1.75rem", maxWidth: 960 }}>
      <h1 style={{ margin: 0 }}>Files</h1>
      <p className="sub">Every photo and document in this workspace — what&apos;s stored, what&apos;s missing, what was shared.</p>

      <div className="stats" style={{ marginTop: 0, marginBottom: 18 }}>
        <div className="stat"><div className="k">Files</div><div className="v">{data.totals.files}</div><div className="m">{data.totals.photos} photos · {data.totals.documents} documents</div></div>
        <div className="stat"><div className="k">Storage used</div><div className="v">{formatBytes(data.totals.bytes) || "0"}</div><div className="m">in the database, hash-chained</div></div>
        <div className="stat"><div className="k">Gaps</div><div className="v" style={{ color: gaps ? "var(--amber-deep)" : undefined }}>{gaps}</div><div className="m">records missing a required document</div></div>
        <div className="stat"><div className="k">Live share links</div><div className="v">{data.shares.length}</div><div className="m">{data.shares.reduce((s, x) => s + x.openCount, 0)} opens in total</div></div>
      </div>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="ch"><h3>By landlord</h3></div>
        {data.byLandlord.length === 0 ? <div className="li"><p className="muted">No properties yet.</p></div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ textAlign: "left", color: "var(--slate)" }}><th style={th}>Landlord</th><th style={{ ...th, textAlign: "right" }}>Properties</th><th style={{ ...th, textAlign: "right" }}>Photos</th><th style={{ ...th, textAlign: "right" }}>Documents</th><th style={{ ...th, textAlign: "right" }}>Storage</th></tr></thead>
              <tbody>{data.byLandlord.map((r) => (
                <tr key={r.landlordId ?? "none"} style={{ borderTop: "1px solid var(--line-soft)" }}>
                  <td style={td}>{r.landlordId ? <Link href={`/landlords/${r.landlordId}`} style={{ color: "var(--navy)", fontWeight: 600 }}>{r.landlord}</Link> : <span className="muted">{r.landlord}</span>}</td>
                  <td style={{ ...td, textAlign: "right" }}>{r.properties}</td><td style={{ ...td, textAlign: "right" }}>{r.photos}</td><td style={{ ...td, textAlign: "right" }}>{r.documents}</td><td style={{ ...td, textAlign: "right" }}>{formatBytes(r.bytes) || "—"}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </section>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["missing", "recent", "shares"] as const).map((t) => (
          <button key={t} type="button" className={tab === t ? "rel sm" : "btn ghost sm"} onClick={() => setTab(t)}>
            {t === "missing" ? `What's missing (${gaps})` : t === "recent" ? "Recent uploads" : `Share links (${data.shares.length})`}
          </button>
        ))}
      </div>

      {tab === "missing" && (
        <>
          <MissingCard title="Tenants" rows={data.missing.tenants.map((t) => ({ href: `/tenants/${t.id}?tab=documents`, name: t.name, sub: t.room, missing: t.missing }))} empty="Every active tenant has all their required documents." />
          <MissingCard title="Properties" rows={data.missing.properties.map((p) => ({ href: `/properties/${p.id}`, name: p.name, sub: null, missing: p.missing }))} empty="Every property has its required documents." />
          <MissingCard title="Landlords" rows={data.missing.landlords.map((l) => ({ href: `/landlords/${l.id}`, name: l.name, sub: null, missing: l.missing }))} empty="Every landlord has given us what we need." />
        </>
      )}

      {tab === "recent" && (
        <section className="card">
          <div className="ch"><h3>Recent uploads</h3></div>
          {data.recent.length === 0 ? <div className="li"><p className="muted">Nothing uploaded yet.</p></div> : data.recent.map((r, i) => (
            <Link key={i} href={r.whereHref} className="li row" style={{ alignItems: "center" }}>
              <div style={{ position: "relative", width: 44, height: 44, borderRadius: 8, overflow: "hidden", background: "#F0EEE9", display: "grid", placeItems: "center", fontSize: 22, flex: "none" }}>
                {r.blobId && r.hasThumb ? <Image src={`/api/files/${r.blobId}/thumb`} alt="" fill sizes="44px" style={{ objectFit: "cover" }} unoptimized /> : fileIcon(r.mimeType, r.name)}
              </div>
              <div className="body"><b>{r.name}</b><p>{r.where} · {r.uploadedBy ?? "—"} · {formatDateTime(r.createdAt)}</p></div>
              <span className="chev">›</span>
            </Link>
          ))}
        </section>
      )}

      {tab === "shares" && (
        <section className="card">
          <div className="ch"><h3>Live share links</h3><span className="muted">Files handed out without an account</span></div>
          {data.shares.length === 0 ? <div className="li"><p className="muted">None live. Open any file and press Share link.</p></div> : data.shares.map((s) => (
            <div className="li" key={s.id}>
              <div className="body">
                <b>{s.label || s.fileName}</b>
                <p>Opened {s.openCount} time{s.openCount === 1 ? "" : "s"}{s.lastOpenedAt ? ` · last ${formatDateTime(s.lastOpenedAt)}` : ""} · expires {formatShortDate(s.expiresAt)} · by {s.createdBy}</p>
              </div>
              <button type="button" className="btn ghost sm" onClick={() => void revoke(s.id)}>Withdraw</button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function MissingCard({ title, rows, empty }: { title: string; rows: Array<{ href: string; name: string; sub: string | null; missing: string[] }>; empty: string }) {
  return (
    <section className="card" style={{ marginBottom: 18 }}>
      <div className="ch"><h3>{title}</h3><span className="muted">{rows.length ? `${rows.length} with gaps` : "complete"}</span></div>
      {rows.length === 0 ? <div className="li"><p className="muted">{empty}</p></div> : rows.map((r) => (
        <Link key={r.href} href={r.href} className="li row">
          <div className="body"><b>{r.name}{r.sub ? <span className="muted" style={{ fontWeight: 500 }}> · {r.sub}</span> : null}</b><p>Missing: {r.missing.join(", ")}</p></div>
          <span className="chev">›</span>
        </Link>
      ))}
    </section>
  );
}

const th: React.CSSProperties = { padding: "10px 18px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 18px" };
