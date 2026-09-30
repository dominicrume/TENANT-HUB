/**
 * Paperwork — the certificate matrix: one row per home, one column per
 * certificate its asset class actually requires. Click an empty or red cell
 * to add the certificate; the cell turns green without reloading the rest
 * of the matrix (BUILD_PLAN C32 — H8: a background refresh never blanks a
 * populated list).
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PaperworkRow, PaperworkCell } from "../../api/paperwork/route";
import { formatShortDate } from "../../../lib/format";

const STATUS_STYLE: Record<PaperworkCell["status"], { bg: string; color: string; label: string }> = {
  valid: { bg: "rgba(46,158,107,.12)", color: "var(--live)", label: "Valid" },
  expiring: { bg: "rgba(232,168,76,.16)", color: "var(--amber-deep)", label: "Expiring" },
  expired: { bg: "rgba(178,74,49,.12)", color: "var(--brick)", label: "Expired" },
  missing: { bg: "rgba(178,74,49,.08)", color: "var(--brick)", label: "Missing" },
};

export default function PaperworkPage() {
  const [rows, setRows] = useState<PaperworkRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ propertyId: string; name: string; certificateTypeId: string } | null>(null);
  const [issuedOn, setIssuedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/paperwork");
    if (!res.ok) { const b = await res.json().catch(() => null); setError(b?.error ?? `${res.status} ${res.statusText}`); return; }
    const body = (await res.json()) as { rows: PaperworkRow[] };
    setRows(body.rows);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const columns = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const row of rows ?? []) for (const cell of row.cells) if (!seen.has(cell.name)) { seen.add(cell.name); ordered.push(cell.name); }
    return ordered;
  }, [rows]);

  async function addCertificate(e: React.FormEvent) {
    e.preventDefault();
    if (!open) return;
    setBusy(true); setFormError(null);
    const res = await fetch("/api/certificates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_id: open.propertyId, certificate_type_id: open.certificateTypeId, issued_on: issuedOn || null, expires_on: expiresOn || null }),
    });
    setBusy(false);
    if (!res.ok) { const b = await res.json().catch(() => null); setFormError(b?.error ?? "Could not save the certificate"); return; }
    setOpen(null); setIssuedOn(""); setExpiresOn("");
    void load(); // rows stays populated with the old data until this resolves — never blanks the matrix
  }

  if (error) return <div style={{ padding: "1.75rem" }}><p style={{ color: "var(--brick)" }}>{error}</p></div>;

  return (
    <div style={{ padding: "1.75rem", maxWidth: 1100 }}>
      <h1 style={{ marginBottom: 18 }}>Paperwork</h1>

      <section className="card" style={{ overflowX: "auto" }}>
        {rows === null ? (
          <div className="li"><p className="muted">Loading…</p></div>
        ) : rows.length === 0 ? (
          <div className="li"><div className="body"><b>No properties yet</b><p>Add one on the Properties page first.</p></div></div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "var(--cream)", textAlign: "left" }}>
                <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--slate)", position: "sticky", left: 0, background: "var(--cream)" }}>Home</th>
                {columns.map((name) => <th key={name} style={{ padding: "12px 14px", fontWeight: 600, color: "var(--slate)", whiteSpace: "nowrap" }}>{name}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.propertyId} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "10px 16px", fontWeight: 600, color: "var(--navy)", position: "sticky", left: 0, background: "var(--surface)" }}>{row.propertyName}</td>
                  {columns.map((name) => {
                    const cell = row.cells.find((c) => c.name === name);
                    if (!cell) return <td key={name} style={{ padding: "10px 14px", color: "var(--line)" }}>—</td>;
                    const tone = STATUS_STYLE[cell.status];
                    const needsAttention = cell.status !== "valid";
                    return (
                      <td key={name} style={{ padding: "8px 10px" }}>
                        <button
                          type="button"
                          disabled={!cell.certificateTypeId || !needsAttention}
                          onClick={() => cell.certificateTypeId && setOpen({ propertyId: row.propertyId, name, certificateTypeId: cell.certificateTypeId })}
                          style={{
                            display: "block", width: "100%", minWidth: 110, textAlign: "left", padding: "7px 10px", borderRadius: 8,
                            border: "none", background: tone.bg, color: tone.color, fontWeight: 600, fontSize: 12.5,
                            cursor: needsAttention && cell.certificateTypeId ? "pointer" : "default",
                          }}
                          title={needsAttention ? "Add certificate" : undefined}
                        >
                          {tone.label}{cell.expiresOn ? ` · ${formatShortDate(cell.expiresOn)}` : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,28,46,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setOpen(null)}>
          <form onSubmit={addCertificate} onClick={(e) => e.stopPropagation()} className="card" style={{ padding: 22, width: 360, display: "grid", gap: 12 }}>
            <h3 style={{ margin: 0 }}>Add {open.name}</h3>
            <label><span className="lbl">Issued</span>
              <input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} style={inp} /></label>
            <label><span className="lbl">Expires</span>
              <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} style={inp} /></label>
            {formError && <p style={{ color: "var(--brick)", margin: 0, fontSize: 13 }}>{formError}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn ghost sm" onClick={() => setOpen(null)}>Cancel</button>
              <button type="submit" className="rel sm" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
