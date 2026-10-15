"use client";

import type { Station } from "../lib/journey";

/**
 * The journey as a progress line — green fills from the left to the last
 * done station, the station to do now pulses amber, the rest wait in grey.
 * Same picture on the dashboard rows and on the tenant page.
 */
export function JourneyDots({ stations, size = 14, showLabels = false }: { stations: Station[]; size?: number; showLabels?: boolean }) {
  return (
    <div className="jd" style={{ display: "flex", alignItems: "center", gap: 0 }} aria-label={stations.map((s) => `${s.n} ${s.label}: ${s.status === "done" ? "done" : s.status === "na" ? "not needed" : s.current ? "to do now" : "later"}`).join("; ")}>
      {stations.map((s, i) => {
        const done = s.status === "done"; const na = s.status === "na";
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "center" }}>
            <span title={`${s.n} · ${s.label} — ${done ? "done" : na ? "not needed for this landlord" : s.current ? "to do now" : s.heldBy ? `on file, waiting for station ${s.heldBy}` : "later"}`}
              className={s.current ? "jd-now" : undefined}
              style={{ width: size, height: size, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", fontSize: size * 0.6, fontWeight: 700, boxSizing: "border-box",
                background: done ? "var(--live)" : s.current ? "var(--amber)" : na ? "#E6E0D6" : "#fff",
                color: done ? "#fff" : s.current ? "var(--navy)" : "#8FA0B4",
                border: done || s.current ? "none" : `2px solid ${na ? "#E6E0D6" : s.heldBy ? "var(--amber)" : "#D9D2C6"}`,
                boxShadow: done ? "0 0 0 2px rgba(30,127,79,.18)" : undefined }}>
              {done ? (size >= 16 ? "✓" : "") : size >= 18 ? s.n : ""}
            </span>
            {i < stations.length - 1 && (
              <span style={{ width: showLabels ? 18 : 8, height: 3, background: "#E6E0D6", flex: "none", borderRadius: 2, overflow: "hidden", margin: showLabels ? "0 2px" : "0 1px" }}>
                <span style={{ display: "block", height: "100%", background: "var(--live)", width: done && (stations[i + 1]!.status === "done" || stations[i + 1]!.current) ? "100%" : done ? "50%" : "0%", transition: "width .6s ease" }} />
              </span>
            )}
          </div>
        );
      })}
      <style jsx global>{`
        @keyframes jdpulse { 0% { box-shadow: 0 0 0 0 rgba(232,168,76,.55); } 70% { box-shadow: 0 0 0 9px rgba(232,168,76,0); } 100% { box-shadow: 0 0 0 0 rgba(232,168,76,0); } }
        .jd-now { animation: jdpulse 1.8s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) { .jd-now { animation: none; box-shadow: 0 0 0 4px rgba(232,168,76,.35); } }
      `}</style>
    </div>
  );
}
