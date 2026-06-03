/**
 * Dashboard shell — topbar + left sidebar (nav + tenant list) + main region.
 * The right contextual panel is rendered per-page (see DECISIONS.md D5).
 * Branded tokens only — navy / amber / cream.
 */
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useBrand, BRAND_LABELS, type Brand } from "../../contexts/BrandContext";
import { TenantSidebar } from "../../components/layout/TenantSidebar";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/tenants", label: "Tenants", icon: "👤" },
  { href: "/sessions", label: "Sessions", icon: "📝" },
  { href: "/ledger", label: "Ledger", icon: "💷" },
  { href: "/audit-log", label: "Audit Log", icon: "🔒" },
  { href: "/risk-flags", label: "Risk Flags", icon: "⚠️" },
  { href: "/reports", label: "Reports", icon: "📊" },
  { href: "/ai-brain", label: "AI Brain", icon: "✨" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

const BRANDS: Brand[] = ["mattys_place", "ash_shahada", "reliance"];
const SHORT: Record<Brand, string> = {
  mattys_place: "Matty's",
  ash_shahada: "Ash Shahada",
  reliance: "Reliance",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { brand, setBrand } = useBrand();

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* ── TOPBAR ─────────────────────────────────────────────── */}
      <header
        style={{
          height: "56px",
          background: "var(--navy)",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          padding: "0 16px",
          flexShrink: 0,
        }}
      >
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none" }}>
          <span
            style={{
              width: "30px", height: "30px", borderRadius: "7px", background: "var(--amber)",
              color: "var(--navy)", fontWeight: 800, display: "flex", alignItems: "center",
              justifyContent: "center", fontFamily: "'Sora',sans-serif",
            }}
          >
            T
          </span>
          <span style={{ color: "#fff", fontWeight: 700, fontFamily: "'Sora',sans-serif", fontSize: "15px" }}>
            Tenant Hub
          </span>
        </Link>

        {/* Letterhead switcher */}
        <div style={{ display: "flex", gap: "4px" }}>
          {BRANDS.map((b) => (
            <button
              key={b}
              onClick={() => setBrand(b)}
              title={BRAND_LABELS[b]}
              style={{
                padding: "5px 10px",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 600,
                fontFamily: "'Sora',sans-serif",
                background: brand === b ? "var(--amber)" : "rgba(255,255,255,0.08)",
                color: brand === b ? "var(--navy)" : "#C7CFDD",
              }}
            >
              {SHORT[b]}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <Link
          href="/intake/new"
          style={{
            background: "var(--amber)", color: "var(--navy)", textDecoration: "none",
            padding: "7px 14px", borderRadius: "7px", fontSize: "13px", fontWeight: 700,
            fontFamily: "'Sora',sans-serif",
          }}
        >
          + New Tenant
        </Link>

        <span
          style={{
            fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", color: "var(--navy)",
            background: "var(--amber)", padding: "4px 8px", borderRadius: "5px",
          }}
        >
          OFFICIAL USE ONLY
        </span>
      </header>

      {/* ── BODY ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* SIDEBAR */}
        <nav
          style={{
            width: "240px",
            background: "var(--navy)",
            display: "flex",
            flexDirection: "column",
            padding: "12px",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1px", marginBottom: "12px" }}>
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "8px 10px", borderRadius: "8px", textDecoration: "none",
                    fontSize: "13px", fontFamily: "'Sora',sans-serif",
                    borderLeft: active ? "3px solid var(--amber)" : "3px solid transparent",
                    background: active ? "rgba(232,168,76,0.12)" : "transparent",
                    color: active ? "var(--amber)" : "#C7CFDD",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <span style={{ width: "16px", textAlign: "center" }}>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div style={{ height: "1px", background: "rgba(255,255,255,0.08)", margin: "4px 0 10px" }} />

          {/* Tenant list — single source of truth (H8) */}
          <TenantSidebar />

          {/* User info + sign out */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "10px", marginTop: "8px" }}>
            <div style={{ color: "#fff", fontSize: "13px", fontWeight: 600 }}>
              {profile?.full_name ?? "—"}
            </div>
            <div style={{ color: "#9AA6BC", fontSize: "11px", marginBottom: "8px", textTransform: "capitalize" }}>
              {profile?.role?.replace("_", " ") ?? ""}
            </div>
            <button
              onClick={handleSignOut}
              style={{
                width: "100%", minHeight: "40px", borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.15)", background: "transparent",
                color: "#C7CFDD", fontSize: "13px", cursor: "pointer", fontFamily: "'Sora',sans-serif",
              }}
            >
              Sign Out
            </button>
          </div>
        </nav>

        {/* MAIN */}
        <main style={{ flex: 1, minWidth: 0, overflowY: "auto", background: "var(--cream)" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
