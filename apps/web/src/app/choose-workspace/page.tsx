"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as s from "../(auth)/_authStyles";
import { useAuth } from "../../contexts/AuthContext";

interface LandlordOption { id: string; name: string; orgId: string; orgName: string; propertiesCount: number; roomsCount: number }

/**
 * /choose-workspace — "Which landlord?" The first thing a manager picks
 * after signing in is whose portfolio they're working on (migration 054).
 * The list is live: every landlord in every organisation this account can
 * reach, so one added internally five minutes ago is already here. Managing
 * agents (Matty's Place, Reliance, Ash Shahada — us) are organisations, not
 * landlords, and never appear (Rume/Osama, 2026-10-09). "All landlords"
 * keeps the whole-company view. Picking a landlord opens their profile.
 */
export default function ChooseLandlordPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [landlords, setLandlords] = useState<LandlordOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/landlords/mine")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: LandlordOption[]) => {
        // Nothing to choose between yet → straight to the dashboard, where
        // "+ Add landlord" is the obvious next step.
        if (data.length === 0) { router.replace("/dashboard"); return; }
        setLandlords(data);
      })
      .catch(() => setError("Could not load your landlords. Try again."));
  }, [router]);

  async function choose(landlordId: string | null) {
    setSwitching(landlordId ?? "__all");
    setError(null);
    try {
      const res = await fetch("/api/auth/switch-landlord", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ landlordId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Could not open that landlord. Try again.");
        setSwitching(null);
        return;
      }
      await refresh();
      router.push(landlordId ? `/landlords/${landlordId}` : "/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
      setSwitching(null);
    }
  }

  const list = (landlords ?? []).filter((l) => !q || l.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <main style={s.page}>
      <div style={{ ...s.card, maxWidth: 520 }}>
        <h1 style={s.heading}>Which landlord?</h1>
        <p style={s.subBrands}>Pick whose properties you&apos;re working on. Anyone added under Properties → Add landlord appears here straight away. You can switch from the top bar at any time.</p>

        {error && <div style={s.errorBox}>{error}</div>}

        {landlords === null && !error ? (
          <p style={{ fontSize: 14, color: "#7A8499" }}>Loading your landlords…</p>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
            {(landlords?.length ?? 0) > 6 && (
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search landlords…" style={{ ...s.input, marginBottom: 2 }} />
            )}
            {list.map((l) => (
              <button key={l.id} type="button" className="btn-dyn" onClick={() => void choose(l.id)} disabled={switching !== null}
                style={{ ...s.input, textAlign: "left", minHeight: 60, color: "var(--navy)", background: "var(--surface)", cursor: switching !== null ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                <span className="avatar" aria-hidden="true" style={{ background: "var(--navy)", color: "#fff", width: 34, height: 34, fontSize: 13 }}>{l.name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{switching === l.id ? "Opening…" : l.name}</b>
                  <small style={{ color: "#7A8499", fontSize: 12 }}>{l.propertiesCount} propert{l.propertiesCount === 1 ? "y" : "ies"} · {l.roomsCount} room{l.roomsCount === 1 ? "" : "s"}{landlords && new Set(landlords.map((x) => x.orgId)).size > 1 ? ` · ${l.orgName}` : ""}</small>
                </span>
                <span aria-hidden="true" style={{ color: "#B9C4D2", fontSize: 20 }}>›</span>
              </button>
            ))}
            {list.length === 0 && <p style={{ fontSize: 13, color: "#7A8499", margin: 0 }}>No landlord matches &ldquo;{q}&rdquo;.</p>}
            <button type="button" onClick={() => void choose(null)} disabled={switching !== null}
              style={{ background: "none", border: "none", color: "#7A8499", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "8px 0 0", textDecoration: "underline" }}>
              {switching === "__all" ? "Opening…" : "Or see all landlords at once →"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
