"use client";

import React, { useState, useEffect, useCallback } from "react";
import { formatShortDate } from "../../lib/format";

interface IdCheckRow {
  id: string;
  provider: string;
  mode: "live" | "simulated";
  status: "pending" | "pass" | "refer" | "fail";
  detail: string | null;
  requested_by: string;
  created_at: string;
  updated_at: string;
}

const STATUS_STYLE: Record<IdCheckRow["status"], { bg: string; color: string; label: string }> = {
  pending: { bg: "rgba(232,168,76,.16)", color: "var(--amber-deep)", label: "Pending" },
  pass:    { bg: "rgba(30,127,79,.12)", color: "#1E7F4F", label: "Pass" },
  refer:   { bg: "rgba(232,168,76,.16)", color: "var(--amber-deep)", label: "Needs manual review" },
  fail:    { bg: "rgba(224,82,82,.12)", color: "#E05252", label: "Fail" },
};

export function IdCheckTab({ tenantId }: { tenantId: string }) {
  const [checks, setChecks] = useState<IdCheckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [documentType, setDocumentType] = useState("Passport");
  const [documentRef, setDocumentRef] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/id-check`);
      if (res.ok) setChecks(await res.json());
    } catch (err) {
      console.error("Failed to load ID checks", err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !dateOfBirth) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/id-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: fullName.trim(), dateOfBirth, documentType, documentRef: documentRef.trim() || undefined }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error ?? `${res.status} ${res.statusText}`);
      }
      setFullName(""); setDateOfBirth(""); setDocumentRef("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the check");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRefresh(checkId: string) {
    setRefreshingId(checkId);
    setError(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/id-check/${checkId}/refresh`, { method: "POST" });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error ?? `${res.status} ${res.statusText}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh the check");
    } finally {
      setRefreshingId(null);
    }
  }

  if (loading) return <div style={{ padding: "20px", color: "var(--navy)" }}>Loading ID checks...</div>;

  return (
    <div style={{ marginTop: "20px" }}>
      <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--navy)", margin: "0 0 6px" }}>Right to Rent / ID Check</h3>
      <p style={{ fontSize: "13px", color: "#7A8499", marginBottom: "20px" }}>
        A third-party report, not a decision — you always make the actual right-to-rent call yourself from what comes back.
      </p>

      <form onSubmit={handleSubmit} className="li" style={{ display: "grid", gap: 10, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name on the document" required
            style={{ flex: 1, minWidth: 180, padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1", fontSize: "13px" }} />
          <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required
            style={{ padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1", fontSize: "13px" }} />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select value={documentType} onChange={(e) => setDocumentType(e.target.value)}
            style={{ padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1", fontSize: "13px" }}>
            <option value="Passport">Passport</option>
            <option value="BRP">Biometric Residence Permit</option>
            <option value="Driving Licence">Driving Licence</option>
            <option value="Share Code">Home Office share code</option>
          </select>
          <input value={documentRef} onChange={(e) => setDocumentRef(e.target.value)} placeholder="Document reference (optional)"
            style={{ flex: 1, minWidth: 180, padding: "10px", borderRadius: "6px", border: "1px solid #EDE8E1", fontSize: "13px" }} />
        </div>
        {error && <p style={{ color: "var(--brick)", fontSize: 13, margin: 0 }}>{error}</p>}
        <div>
          <button type="submit" disabled={submitting || !fullName.trim() || !dateOfBirth}
            style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: submitting ? "#ccc" : "var(--amber)", color: "var(--navy)", fontWeight: 700, fontSize: "12px", cursor: submitting ? "not-allowed" : "pointer" }}>
            {submitting ? "Submitting…" : "Run a check"}
          </button>
        </div>
      </form>

      {checks.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", background: "#F8F4EF", borderRadius: "8px", border: "1px dashed #EDE8E1" }}>
          <span style={{ fontSize: "24px", display: "block", marginBottom: "8px" }}>🪪</span>
          <p style={{ fontSize: "13px", color: "#7A8499", margin: 0 }}>No checks run yet.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {checks.map((c) => {
            const style = STATUS_STYLE[c.status];
            return (
              <div key={c.id} className="li" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div className="body">
                  <b style={{ textTransform: "capitalize" }}>{c.provider}</b>
                  {c.mode === "simulated" && (
                    <span style={{ marginLeft: 8, fontSize: "10px", fontWeight: 700, color: "#7A8499", border: "1px solid #EDE8E1", borderRadius: "10px", padding: "1px 7px" }}>SIMULATED</span>
                  )}
                  <p style={{ margin: "4px 0 0" }}>
                    Requested by {c.requested_by} · {formatShortDate(c.created_at)}
                    {c.detail ? ` · ${c.detail}` : ""}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "20px", background: style.bg, color: style.color }}>
                    {style.label}
                  </span>
                  {c.status === "pending" && (
                    <button type="button" className="btn ghost sm" disabled={refreshingId === c.id} onClick={() => void handleRefresh(c.id)}>
                      {refreshingId === c.id ? "Checking…" : "Check status"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
