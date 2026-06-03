/**
 * Settings — Users / Service Charges / Brands / Blockchain Status.
 * Users + Blockchain read live data; Service Charges default and Brand details
 * are local until a settings table exists (noted inline).
 */
"use client";

import { useEffect, useState } from "react";
import { BRAND_LABELS } from "../../../contexts/BrandContext";
import { formatDateTime, truncateHash } from "../../../lib/format";

type Tab = "users" | "charges" | "brands" | "blockchain";

interface Profile { id: string; full_name: string; role: string; email: string | null }
interface Stamp { id: string; status: string; audit_hash: string; tx_hash: string | null; created_at: string; tenant_id: string | null }

const STAMP_COLOR: Record<string, string> = { pending: "#E8A84C", processing: "#E8A84C", done: "#34C87A", failed: "#E05252", dead_letter: "#E05252" };

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("users");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [rate, setRate] = useState("150");

  useEffect(() => {
    fetch("/api/profiles").then((r) => (r.ok ? r.json() : [])).then((d) => setProfiles(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/stamp-queue").then((r) => (r.ok ? r.json() : [])).then((d) => setStamps(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const TABS: { key: Tab; label: string }[] = [
    { key: "users", label: "Users" },
    { key: "charges", label: "Service Charges" },
    { key: "brands", label: "Brands" },
    { key: "blockchain", label: "Blockchain Status" },
  ];

  return (
    <div style={{ padding: "1.75rem", fontFamily: "'Sora', sans-serif", display: "flex", gap: "20px", flexWrap: "wrap" }}>
      <nav style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "160px" }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ textAlign: "left", padding: "9px 12px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "13px", fontFamily: "'Sora',sans-serif",
              background: tab === t.key ? "var(--navy)" : "transparent", color: tab === t.key ? "#fff" : "#445" }}>
            {t.label}
          </button>
        ))}
      </nav>

      <div style={{ flex: 1, minWidth: "280px" }}>
        {tab === "users" && (
          <div>
            <h2 style={{ color: "var(--navy)", fontSize: "16px", fontWeight: 700, marginBottom: "10px" }}>Users</h2>
            {profiles.length === 0 ? <p style={{ color: "#7A8499", fontSize: "13px" }}>No users (manager access required).</p> : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {profiles.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", border: "1px solid #EDE8E1", borderRadius: "8px", fontSize: "13px" }}>
                    <span style={{ fontWeight: 600, color: "var(--navy)" }}>{p.full_name}</span>
                    <span style={{ color: "#7A8499" }}>{p.email}</span>
                    <span style={{ marginLeft: "auto", fontSize: "11px", textTransform: "capitalize", color: "#445" }}>{p.role.replace("_", " ")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "charges" && (
          <div>
            <h2 style={{ color: "var(--navy)", fontSize: "16px", fontWeight: 700, marginBottom: "10px" }}>Service Charges</h2>
            <label style={{ fontSize: "13px", color: "#445" }}>Default weekly rate (£)
              <input value={rate} onChange={(e) => setRate(e.target.value)} type="number"
                style={{ display: "block", minHeight: "44px", padding: "8px 11px", borderRadius: "8px", border: "1px solid #EDE8E1", marginTop: "6px", maxWidth: "200px" }} />
            </label>
            <p style={{ fontSize: "12px", color: "#7A8499", marginTop: "8px" }}>Persisting this needs a settings table (not yet in the schema).</p>
          </div>
        )}

        {tab === "brands" && (
          <div>
            <h2 style={{ color: "var(--navy)", fontSize: "16px", fontWeight: 700, marginBottom: "10px" }}>Brands</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {Object.entries(BRAND_LABELS).map(([key, label]) => (
                <div key={key} style={{ padding: "12px", border: "1px solid #EDE8E1", borderRadius: "10px" }}>
                  <div style={{ fontWeight: 600, color: "var(--navy)" }}>{label}</div>
                  <div style={{ fontSize: "12px", color: "#7A8499" }}>Signatory: AHSAN REHMAN</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "blockchain" && (
          <div>
            <h2 style={{ color: "var(--navy)", fontSize: "16px", fontWeight: 700, marginBottom: "10px" }}>Blockchain Status</h2>
            {stamps.length === 0 ? <p style={{ color: "#7A8499", fontSize: "13px" }}>No stamp queue entries.</p> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead><tr style={{ textAlign: "left", color: "#7A8499" }}><th style={{ padding: "6px" }}>Status</th><th style={{ padding: "6px" }}>Hash</th><th style={{ padding: "6px" }}>Tx</th><th style={{ padding: "6px" }}>Created</th></tr></thead>
                <tbody>
                  {stamps.map((s) => (
                    <tr key={s.id} style={{ borderTop: "1px solid #F3EEE7" }}>
                      <td style={{ padding: "6px" }}><span style={{ color: STAMP_COLOR[s.status] ?? "#7A8499", fontWeight: 600 }}>● {s.status}</span></td>
                      <td style={{ padding: "6px", fontFamily: "'JetBrains Mono',monospace" }}>{truncateHash(s.audit_hash, 12)}</td>
                      <td style={{ padding: "6px", fontFamily: "'JetBrains Mono',monospace" }}>{truncateHash(s.tx_hash, 10)}</td>
                      <td style={{ padding: "6px", fontFamily: "'JetBrains Mono',monospace" }}>{formatDateTime(s.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
