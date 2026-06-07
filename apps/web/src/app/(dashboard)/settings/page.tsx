/**
 * Settings — Users / Service Charges / Brands / Blockchain Status.
 * Users + Blockchain read live data; Service Charges default and Brand details
 * are local until a settings table exists (noted inline).
 */
"use client";

import { useEffect, useState } from "react";
import { useBrand, BRAND_LABELS } from "../../../contexts/BrandContext";
import { formatDateTime, truncateHash } from "../../../lib/format";

type Tab = "users" | "charges" | "brands" | "billing" | "blockchain";

interface Profile { id: string; full_name: string; role: string; email: string | null }
interface Stamp { id: string; status: string; audit_hash: string; tx_hash: string | null; created_at: string; tenant_id: string | null }

const STAMP_COLOR: Record<string, string> = { pending: "#E8A84C", processing: "#E8A84C", done: "#34C87A", failed: "#E05252", dead_letter: "#E05252" };

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("users");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [rate, setRate] = useState("150");
  const [settingId, setSettingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  
  const { brand } = useBrand();

  useEffect(() => {
    fetch("/api/profiles").then((r) => (r.ok ? r.json() : [])).then((d) => setProfiles(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/stamp-queue").then((r) => (r.ok ? r.json() : [])).then((d) => setStamps(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // Fetch settings when brand changes
  useEffect(() => {
    fetch(`/api/settings?brand=${brand}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        if (d && d.length > 0) {
          setSettingId(d[0].id);
          setRate(String(d[0].service_charge_default));
        }
      })
      .catch(() => {});
  }, [brand]);

  async function handleSaveRate() {
    if (!settingId) return;
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: settingId, service_charge_default: Number(rate) })
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "users", label: "Users" },
    { key: "charges", label: "Service Charges" },
    { key: "brands", label: "Brands" },
    { key: "billing", label: "Billing & Subscription" },
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
            <div style={{ display: "flex", alignItems: "flex-end", gap: "12px" }}>
              <label style={{ fontSize: "13px", color: "#445" }}>Default weekly rate (£)
                <input value={rate} onChange={(e) => setRate(e.target.value)} type="number"
                  style={{ display: "block", minHeight: "44px", padding: "8px 11px", borderRadius: "8px", border: "1px solid #EDE8E1", marginTop: "6px", maxWidth: "200px", fontFamily: "inherit" }} />
              </label>
              <button 
                onClick={handleSaveRate} 
                disabled={saving || !settingId}
                style={{
                  height: "44px", padding: "0 16px", borderRadius: "8px", border: "none",
                  background: "var(--amber)", color: "var(--navy)", fontWeight: 700,
                  cursor: (saving || !settingId) ? "not-allowed" : "pointer", opacity: (saving || !settingId) ? 0.6 : 1,
                  fontFamily: "'Sora',sans-serif"
                }}
              >
                {saving ? "Saving..." : "Save Rate"}
              </button>
            </div>
            <p style={{ fontSize: "12px", color: "#34C87A", marginTop: "8px" }}>Rate is persisted in the global settings table.</p>
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

        {tab === "billing" && (
          <div>
            <h2 style={{ color: "var(--navy)", fontSize: "16px", fontWeight: 700, marginBottom: "10px" }}>Billing &amp; Subscription</h2>
            
            <div style={{ padding: "20px", border: "1px solid #EDE8E1", borderRadius: "12px", background: "#fff", maxWidth: "600px", marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div>
                  <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--navy)", marginBottom: "4px" }}>Professional Plan</h3>
                  <p style={{ fontSize: "13px", color: "#1E7F4F", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#34C87A" }}></span> Active
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--navy)" }}>£99<span style={{ fontSize: "14px", fontWeight: 400, color: "#7A8499" }}>/mo</span></div>
                  <div style={{ fontSize: "12px", color: "#7A8499" }}>Next billing date: 1st July</div>
                </div>
              </div>
              
              <div style={{ borderTop: "1px solid #F3EEE7", paddingTop: "16px", display: "flex", gap: "12px" }}>
                <button style={{ padding: "8px 16px", borderRadius: "6px", background: "var(--amber)", color: "var(--navy)", fontWeight: 600, border: "none", cursor: "pointer", fontSize: "13px" }}>
                  Manage in Stripe
                </button>
                <button style={{ padding: "8px 16px", borderRadius: "6px", background: "transparent", color: "#445", fontWeight: 600, border: "1px solid #EDE8E1", cursor: "pointer", fontSize: "13px" }}>
                  View Invoices
                </button>
              </div>
            </div>

            <h3 style={{ color: "var(--navy)", fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}>Usage</h3>
            <div style={{ padding: "16px", border: "1px solid #EDE8E1", borderRadius: "12px", background: "#fff", maxWidth: "600px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px", color: "#445" }}>
                <span>Active Tenants</span>
                <span style={{ fontWeight: 600 }}>12 / 50</span>
              </div>
              <div style={{ width: "100%", height: "8px", background: "#F3EEE7", borderRadius: "4px", overflow: "hidden", marginBottom: "20px" }}>
                <div style={{ width: "24%", height: "100%", background: "#38bdf8" }}></div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px", color: "#445" }}>
                <span>AI Intake Extractions</span>
                <span style={{ fontWeight: 600 }}>85 / 500</span>
              </div>
              <div style={{ width: "100%", height: "8px", background: "#F3EEE7", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ width: "17%", height: "100%", background: "var(--amber)" }}></div>
              </div>
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
