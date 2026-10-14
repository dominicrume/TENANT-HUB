"use client";

import type { Station } from "../lib/journey";

/** Eight dots, one per station — green done, red to do, grey not needed. The sketch Matloob drew, as a component. */
export function JourneyDots({ stations, size = 14, showLabels = false }: { stations: Station[]; size?: number; showLabels?: boolean }) {
  return (
    <div className="jd" style={{ display: "flex", alignItems: "center", gap: showLabels ? 0 : 6 }} aria-label={stations.map((s) => `${s.n} ${s.label}: ${s.status === "done" ? "done" : s.status === "na" ? "not needed" : "to do"}`).join("; ")}>
      {stations.map((s, i) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center" }}>
          <span title={`${s.n} · ${s.label} — ${s.status === "done" ? "done" : s.status === "na" ? "not needed for this landlord" : "to do"}`}
            style={{ width: size, height: size, borderRadius: "50%", flex: "none", background: s.status === "done" ? "var(--live)" : s.status === "na" ? "#CBD2DB" : "var(--brick)", boxShadow: s.status === "todo" ? "0 0 0 3px rgba(178,74,49,.18)" : "none", display: "grid", placeItems: "center", color: "#fff", fontSize: size * 0.6, fontWeight: 700 }}>
            {size >= 18 ? s.n : ""}
          </span>
          {i < stations.length - 1 && <span style={{ width: showLabels ? 18 : 6, height: 2, background: stations[i + 1]!.status === "done" && s.status === "done" ? "var(--live)" : "var(--line)", flex: "none", margin: showLabels ? "0 2px" : 0 }} />}
        </div>
      ))}
    </div>
  );
}
