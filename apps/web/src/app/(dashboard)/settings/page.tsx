/**
 * Settings — Users / Service Charges / Brands / Blockchain Status / Billing.
 * Users + Blockchain read live data; Service Charges default and Brand
 * details are local until a settings table exists (noted inline). Rebuilt
 * onto the console design system; no data logic changed. Billing errors show
 * inline now instead of a native browser alert.
 */
"use client";

import { useEffect, useState } from "react";
import { useBrand, BRAND_LABELS } from "../../../contexts/BrandContext";
import { formatDateTime, truncateHash } from "../../../lib/format";

type Tab = "users" | "charges" | "brands" | "billing" | "blockchain";

interface Profile { id: string; full_name: string; role: string; email: string | null }
interface Stamp { id: string; status: string; audit_hash: string; tx_hash: string | null; created_at: string; tenant_id: string | null }

const STAMP_TONE: Record<string, { color: string; label: string }> = {
  pending: { color: "var(--amber-deep)", label: "pending" },
  processing: { color: "var(--amber-deep)", label: "processing" },
  done: { color: "var(--live)", label: "done" },
  failed: { color: "var(--brick)", label: "failed" },
  dead_letter: { color: "var(--brick)", label: "failed" },
};

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("users");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [rate, setRate] = useState("150");
  const [settingId, setSettingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTenantsCount, setActiveTenantsCount] = useState<number>(0);
  const [aiExtractionsCount, setAiExtractionsCount] = useState<number>(0);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [rateSaved, setRateSaved] = useState(false);

  const { brand } = useBrand();

  useEffect(() => {
    fetch("/api/profiles").then((r) => (r.ok ? r.json() : [])).then((d) => setProfiles(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/stamp-queue").then((r) => (r.ok ? r.json() : [])).then((d) => setStamps(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/tenants").then((r) => (r.ok ? r.json() : [])).then((d) => setActiveTenantsCount(Array.isArray(d) ? d.length : 0)).catch(() => {});
    fetch("/api/drafts").then((r) => (r.ok ? r.json() : [])).then((d) => setAiExtractionsCount(Array.isArray(d) ? d.length : 0)).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/settings?brand=${brand}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (d && d.length > 0) { setSettingId(d[0].id); setRate(String(d[0].service_charge_default)); } })
      .catch(() => {});
  }, [brand]);

  async function handleSaveRate() {
    if (!settingId) return;
    setSaving(true);
    setRateError(null);
    setRateSaved(false);
    try {
      const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: settingId, service_charge_default: Number(rate) }) });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        setRateError(b?.error ?? "Could not save the rate. Try again.");
        return;
      }
      setRateSaved(true);
    } catch {
      setRateError("Could not reach the server. The rate was not saved.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStripePortal() {
    setBillingBusy(true);
    setBillingError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setBillingError(data.error || "Couldn't open Stripe. Try again in a moment.");
    } catch {
      setBillingError("Couldn't reach Stripe. Check the connection and try again.");
    } finally {
      setBillingBusy(false);
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "users", label: "Users" },
    { key: "charges", label: "Service charges" },
    { key: "brands", label: "Brands" },
    { key: "billing", label: "Billing" },
    { key: "blockchain", label: "Blockchain status" },
  ];

  return (
    <div style={{ padding: "1.75rem", display: "flex", gap: 24, flexWrap: "wrap", maxWidth: 920 }}>
      <nav style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 170 }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? "btn sm" : "btn ghost sm"} style={{ textAlign: "left" }} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div style={{ flex: 1, minWidth: 280 }}>
        {tab === "users" && (
          <section className="card">
            <div className="ch"><h3>Users</h3></div>
            {profiles.length === 0 ? <div className="li"><p className="muted">No users to show (manager access required).</p></div> : profiles.map((p) => (
              <div className="li" key={p.id}>
                <div className="body"><b>{p.full_name}</b><p>{p.email}</p></div>
                <span className="tag" style={{ background: "rgba(15,28,46,.06)", color: "var(--navy)", textTransform: "capitalize" }}>{p.role.replace("_", " ")}</span>
              </div>
            ))}
          </section>
        )}

        {tab === "charges" && (
          <section className="card">
            <div className="ch"><h3>Service charges</h3></div>
            <div className="li" style={{ display: "grid", gap: 10 }}>
              <label><span className="lbl">Default weekly rate (£)</span>
                <input value={rate} onChange={(e) => { setRate(e.target.value); setRateSaved(false); }} type="number" style={inp} /></label>
              {rateError && <p style={{ color: "var(--brick)", margin: 0, fontSize: 13 }}>{rateError}</p>}
              {rateSaved && !rateError && <p style={{ color: "var(--live)", margin: 0, fontSize: 13 }}>Saved.</p>}
              <div><button type="button" className="rel sm" onClick={handleSaveRate} disabled={saving || !settingId}>{saving ? "Saving…" : "Save rate"}</button></div>
            </div>
          </section>
        )}

        {tab === "brands" && (
          <section className="card">
            <div className="ch"><h3>Brands</h3></div>
            {Object.entries(BRAND_LABELS).map(([key, label]) => (
              <div className="li" key={key}><div className="body"><b>{label}</b><p>Signatory: Ahsan Rehman</p></div></div>
            ))}
          </section>
        )}

        {tab === "billing" && (
          <>
            <section className="card" style={{ marginBottom: 18 }}>
              <div className="ch"><h3>Plan</h3></div>
              <div className="li">
                <div className="body">
                  <b>Professional plan</b>
                  <p>£99/mo · next billing date 1st July</p>
                </div>
                <div className="btns">
                  <button type="button" className="btn ghost sm" onClick={handleStripePortal} disabled={billingBusy}>View invoices</button>
                  <button type="button" className="rel sm" onClick={handleStripePortal} disabled={billingBusy}>{billingBusy ? "Opening…" : "Manage in Stripe"}</button>
                </div>
              </div>
              {billingError && <div className="li"><p style={{ color: "var(--brick)", margin: 0, fontSize: 13.5 }}>{billingError}</p></div>}
            </section>
            <section className="card">
              <div className="ch"><h3>Usage</h3></div>
              <div className="li" style={{ display: "block" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}><span>Active tenants</span><b>{activeTenantsCount} / 50</b></div>
                <div style={{ width: "100%", height: 8, background: "var(--line-soft)", borderRadius: 4, overflow: "hidden", marginBottom: 16 }}>
                  <div style={{ width: `${Math.min((activeTenantsCount / 50) * 100, 100)}%`, height: "100%", background: "var(--live)" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}><span>AI intake extractions</span><b>{aiExtractionsCount} / 500</b></div>
                <div style={{ width: "100%", height: 8, background: "var(--line-soft)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min((aiExtractionsCount / 500) * 100, 100)}%`, height: "100%", background: "var(--amber)" }} />
                </div>
              </div>
            </section>
          </>
        )}

        {tab === "blockchain" && (
          <section className="card">
            <div className="ch"><h3>Blockchain status</h3></div>
            {stamps.length === 0 ? <div className="li"><p className="muted">No stamp queue entries.</p></div> : stamps.map((s) => {
              const tone = STAMP_TONE[s.status] ?? { color: "var(--slate)", label: s.status };
              return (
                <div className="li" key={s.id}>
                  <div className="body">
                    <b style={{ color: tone.color, textTransform: "capitalize" }}>● {tone.label}</b>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace" }}>{truncateHash(s.audit_hash, 14)}{s.tx_hash ? ` · tx ${truncateHash(s.tx_hash, 10)}` : ""}</p>
                  </div>
                  <span className="muted" style={{ fontSize: 12.5 }}>{formatDateTime(s.created_at)}</span>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", maxWidth: 220, minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
