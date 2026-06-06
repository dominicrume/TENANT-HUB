"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function RiskFlagsIndexPage() {
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/risk-flags")
      .then(res => res.ok ? res.json() : [])
      .then(data => setFlags(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: "32px", fontFamily: "'Sora', sans-serif" }}>Loading risk flags...</div>;

  return (
    <div style={{ padding: "32px", fontFamily: "'Sora', sans-serif" }}>
      <h1 style={{ color: "var(--navy)", marginBottom: "24px", margin: 0 }}>Risk Flags</h1>
      
      {flags.length === 0 ? (
        <p style={{ color: "#34C87A", fontWeight: 600 }}>No risk flags identified. All clear!</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {flags.map((f, i) => (
            <div key={i} style={{ 
              background: "#fff", borderRadius: "10px", padding: "16px", border: "1px solid", 
              borderColor: f.severity === "High" ? "rgba(224,82,82,0.3)" : "rgba(232,168,76,0.3)",
              borderLeft: f.severity === "High" ? "4px solid #E05252" : "4px solid #E8A84C"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ margin: "0 0 4px 0", color: "var(--navy)" }}>
                    <Link href={`/tenants/${f.tenant_id}`} style={{ textDecoration: "none", color: "inherit" }}>
                      {f.name} {f.room ? `(Room ${f.room})` : ""}
                    </Link>
                  </h3>
                  <p style={{ margin: 0, color: "#475569", fontSize: "14px" }}>{f.reason}</p>
                </div>
                <span style={{ 
                  padding: "4px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700,
                  background: f.severity === "High" ? "rgba(224,82,82,0.15)" : "rgba(232,168,76,0.15)",
                  color: f.severity === "High" ? "#E05252" : "#E8A84C"
                }}>
                  {f.severity} SEVERITY
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
