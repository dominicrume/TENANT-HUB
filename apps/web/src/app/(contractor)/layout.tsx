"use client";

import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";

const NAV = [
  { href: "/jobs", label: "My Jobs", icon: "🛠️" },
];

export default function ContractorLayout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <header style={{ height: "56px", background: "var(--navy)", display: "flex", alignItems: "center", padding: "0 16px" }}>
        <span style={{ color: "#fff", fontWeight: 700, fontFamily: "'Sora',sans-serif", fontSize: "15px" }}>
          Tenant Hub Contractor Portal
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={signOut} style={{ color: "#fff", border: "1px solid rgba(255,255,255,0.2)", padding: "4px 8px", borderRadius: "4px", background: "transparent", cursor: "pointer" }}>
          Sign Out
        </button>
      </header>
      <div style={{ display: "flex", flex: 1 }}>
        <main style={{ flex: 1, overflowY: "auto", background: "var(--cream)" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
