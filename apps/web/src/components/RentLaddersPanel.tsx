/**
 * RentLaddersPanel — the Rent screen's new top section (BUILD_PLAN C30):
 * every open arrears ladder drawn as beads with a plain-words "why", the
 * bank transactions too weak to mark paid on their own ("Is this rent?"),
 * and who is simply up to date. Sits above the existing charge/payment
 * ledger, which is unchanged — this is additive, not a replacement.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatShortDate } from "../lib/format";

interface Ladder {
  tenantId: string; tenantName: string; roomNumber: string | null; stage: string; stageIndex: number;
  rungs: Array<{ stage: string; label: string }>; balance: number | null; why: string;
}
interface Unmatched { id: string; tenantName: string | null; amount: number; received_on: string; external_reference: string | null; confidence: number; is_simulated: boolean }
interface UpToDate { tenantId: string; tenantName: string; roomNumber: string | null }
interface Summary { ladders: Ladder[]; isThisRent: Unmatched[]; upToDate: UpToDate[] }

export function RentLaddersPanel() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/rent/summary");
    if (!res.ok) { const b = await res.json().catch(() => null); setError(b?.error ?? `${res.status} ${res.statusText}`); return; }
    setData(await res.json());
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function resolve(id: string, action: "confirm" | "dismiss") {
    setBusy(id);
    await fetch(`/api/rent/unmatched/${id}/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    setBusy(null);
    void load();
  }

  if (error) return <div className="card" style={{ marginBottom: 18 }}><div className="li"><div className="body"><b>Couldn&apos;t load the rent summary</b><p>{error}</p></div></div></div>;
  if (!data) return <div className="card" style={{ marginBottom: 18 }}><div className="li"><p className="muted">Loading…</p></div></div>;

  return (
    <>
      {data.ladders.length > 0 && (
        <section className="card" style={{ marginBottom: 18 }}>
          <div className="ch"><h3>Arrears ladders ({data.ladders.length})</h3></div>
          {data.ladders.map((l) => (
            <div className="li" key={l.tenantId}>
              <div className="body">
                <b>{l.tenantName}{l.roomNumber ? ` · Room ${l.roomNumber}` : ""}</b>
                <div style={{ display: "flex", gap: 5, margin: "6px 0" }} aria-hidden="true">
                  {l.rungs.map((r, i) => (
                    <span key={r.stage} title={r.label} style={{
                      width: 11, height: 11, borderRadius: "50%",
                      background: i < l.stageIndex ? "var(--slate)" : i === l.stageIndex ? "var(--brick)" : "var(--line)",
                      border: i === l.stageIndex ? "2px solid var(--brick)" : "none",
                    }} />
                  ))}
                </div>
                <p><b style={{ color: "var(--brick)" }}>{l.rungs[l.stageIndex]?.label ?? l.stage}</b>: {l.why}</p>
              </div>
              <Link className="btn ghost sm" href={`/tenants/${l.tenantId}?tab=ledger`}>Open ledger</Link>
            </div>
          ))}
        </section>
      )}

      {data.isThisRent.length > 0 && (
        <section className="card" style={{ marginBottom: 18 }}>
          <div className="ch"><h3>Is this rent? ({data.isThisRent.length})</h3></div>
          {data.isThisRent.map((u) => (
            <div className="li" key={u.id}>
              <div className="body">
                <b>£{u.amount.toFixed(2)} on {formatShortDate(u.received_on)}{u.is_simulated ? " (simulated bank feed)" : ""}</b>
                <p>
                  {u.tenantName ? `Looks like ${u.tenantName}` : "No tenant guessed"} · {Math.round(u.confidence * 100)}% match
                  {u.external_reference ? ` · reference "${u.external_reference}"` : ""}
                </p>
              </div>
              <div className="btns">
                <button type="button" className="btn ghost sm" disabled={busy === u.id} onClick={() => resolve(u.id, "dismiss")}>Not rent</button>
                <button type="button" className="btn sm" disabled={busy === u.id || !u.tenantName} onClick={() => resolve(u.id, "confirm")}>{busy === u.id ? "Saving…" : "Yes, mark paid"}</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {data.upToDate.length > 0 && (
        <details className="card" style={{ marginBottom: 18, padding: 0 }}>
          <summary style={{ cursor: "pointer", padding: "15px 18px", fontWeight: 600, fontSize: 14.5 }}>Up to date ({data.upToDate.length})</summary>
          {data.upToDate.map((t) => (
            <div className="li" key={t.tenantId}><div className="body"><b>{t.tenantName}{t.roomNumber ? ` · Room ${t.roomNumber}` : ""}</b></div></div>
          ))}
        </details>
      )}
    </>
  );
}
