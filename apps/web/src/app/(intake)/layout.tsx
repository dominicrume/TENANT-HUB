/**
 * Intake layout — clean, no dashboard nav. A centred white card on cream with
 * the brand at top and a 5-dot progress stepper derived from the URL.
 */
"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { INTAKE_STEPS } from "../../lib/intake";

function stepFromPath(path: string): number {
  if (path.endsWith("/new") || path === "/intake/new") return 0;
  if (path.includes("/extract")) return 1;
  if (path.includes("/review")) return 2;
  if (path.includes("/verify")) return 3;
  if (path.includes("/complete")) return 4;
  return 0;
}

export default function IntakeLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  const current = stepFromPath(path);

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)", padding: "2rem 1rem", fontFamily: "'Sora', sans-serif" }}>
      <div style={{ maxWidth: "760px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "18px" }}>
          <span style={{ fontWeight: 800, fontSize: "18px", color: "var(--navy)" }}>Tenant Hub</span>
          <span style={{ fontSize: "12px", color: "#7A8499", marginLeft: "8px" }}>· New tenant intake</span>
        </div>

        {/* Stepper */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "22px" }}>
          {INTAKE_STEPS.map((label, i) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                <span style={{
                  width: "12px", height: "12px", borderRadius: "50%",
                  background: i <= current ? "var(--amber)" : "#D9D2C7",
                }} />
                <span style={{ fontSize: "10px", color: i === current ? "var(--navy)" : "#9AA6BC", fontWeight: i === current ? 700 : 400 }}>
                  {label}
                </span>
              </div>
              {i < INTAKE_STEPS.length - 1 && (
                <span style={{ width: "26px", height: "2px", background: i < current ? "var(--amber)" : "#D9D2C7", marginBottom: "14px" }} />
              )}
            </div>
          ))}
        </div>

        <div style={{ background: "var(--surface)", borderRadius: "16px", padding: "1.75rem", boxShadow: "0 10px 30px rgba(15,28,46,0.10)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
