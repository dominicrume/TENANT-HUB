"use client";

import { useState } from "react";
import { TITLES } from "@tenant-hub/validation";

/**
 * Add tenancy, for real — one popup: the tenant's own details (name, DOB,
 * NINO, nationality, mobile), not a dropdown of pre-existing tenants (which
 * is empty for a brand-new property anyway). Address, postcode, room number
 * and move-in date come from the room itself, not retyped. Creates the
 * tenant (POST /api/tenants) then the tenancy (POST /api/tenancies) in one
 * action — benefit fields are required by the tenant schema but not asked
 * here; sensible defaults go in, editable afterwards from the tenant's own
 * Personal Details / Housing Benefit tabs.
 */
export function AddTenancyModal({
  open, onClose, onCreated, unitId, roomReference, address, postcode,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  unitId: string;
  roomReference: string;
  address: string;
  postcode: string;
}) {
  const [title, setTitle] = useState<string>(TITLES[0]);
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [nino, setNino] = useState("");
  const [nationality, setNationality] = useState("British");
  const [mobile, setMobile] = useState("");
  const [rent, setRent] = useState("");
  const [frequency, setFrequency] = useState("weekly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const tenantRes = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, full_name: fullName, dob, nino, nationality, mobile,
          address, postcode, room_number: roomReference, moved_in: today,
          benefit_type: "Universal Credit", benefit_frequency: "Monthly", benefit_amount: "0",
        }),
      });
      if (!tenantRes.ok) {
        const b = await tenantRes.json().catch(() => null);
        const issue = b?.issues?.[0]?.message;
        throw new Error(issue ?? b?.error ?? "Could not add the tenant");
      }
      const tenant = await tenantRes.json();

      const tenancyRes = await fetch("/api/tenancies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit_id: unitId, tenant_id: tenant.id, rent_amount: Number(rent || 0), rent_frequency: frequency }),
      });
      if (!tenancyRes.ok) {
        const b = await tenancyRes.json().catch(() => null);
        throw new Error(b?.error ?? "Tenant was added, but the tenancy could not be linked to this room");
      }

      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the tenancy");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,28,46,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
      <form onSubmit={submit} style={{ background: "#fff", borderRadius: 14, padding: "1.5rem", width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0, color: "var(--navy)", fontSize: 18 }}>Add tenancy — {roomReference}</h2>
        <p style={{ margin: 0, fontSize: 13, color: "#7A8499" }}>{address}, {postcode}</p>

        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ width: 90 }}><span className="lbl">Title</span>
            <select value={title} onChange={(e) => setTitle(e.target.value)} style={inp}>
              {TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label style={{ flex: 1 }}><span className="lbl">Full name</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required style={inp} />
          </label>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ flex: 1 }}><span className="lbl">Date of birth</span>
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required style={inp} />
          </label>
          <label style={{ flex: 1 }}><span className="lbl">Nationality</span>
            <input value={nationality} onChange={(e) => setNationality(e.target.value)} required style={inp} />
          </label>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ flex: 1 }}><span className="lbl">National Insurance No.</span>
            <input value={nino} onChange={(e) => setNino(e.target.value.toUpperCase())} required placeholder="QQ 12 34 56 A" style={inp} />
          </label>
          <label style={{ flex: 1 }}><span className="lbl">Mobile</span>
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} required style={inp} />
          </label>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ flex: 1 }}><span className="lbl">Rent</span>
            <input type="number" min="0" step="0.01" value={rent} onChange={(e) => setRent(e.target.value)} required style={inp} />
          </label>
          <label style={{ flex: 1 }}><span className="lbl">Frequency</span>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)} style={inp}>
              <option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="four_weekly">4-weekly</option>
              <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option>
            </select>
          </label>
        </div>

        {error && <p style={{ color: "var(--brick)", fontSize: 13, margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button type="button" onClick={onClose} className="btn ghost sm">Cancel</button>
          <button type="submit" className="rel sm" disabled={busy || !fullName.trim() || !dob || !nino.trim() || !mobile.trim()}>
            {busy ? "Adding…" : "Add tenancy"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inp: React.CSSProperties = { display: "block", width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #EDE8E1", marginTop: 4, boxSizing: "border-box" };
