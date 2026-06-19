/**
 * Dashboard shell — topbar + left sidebar (nav + tenant list) + main region.
 * The right contextual panel is rendered per-page (see DECISIONS.md D5).
 * Branded tokens only — navy / amber / cream.
 */
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useBrand, BRAND_LABELS, type Brand } from "../../contexts/BrandContext";
import { TenantSidebar } from "../../components/layout/TenantSidebar";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/tenants", label: "Tenants", icon: "👤" },
  { href: "/sessions", label: "Sessions", icon: "📝" },
  { href: "/ledger", label: "Ledger", icon: "💷" },
  { href: "/maintenance", label: "Maintenance", icon: "🔧" },
  { href: "/handovers", label: "Handovers", icon: "📋" },
  { href: "/communications", label: "Communications", icon: "📩" },
  { href: "/audit-log", label: "Audit Log", icon: "🔒" },
  { href: "/risk-flags", label: "Risk Flags", icon: "⚠️" },
  { href: "/analytics", label: "Analytics", icon: "📈" },
  { href: "/reports", label: "Reports", icon: "📊" },
  { href: "/ai-brain", label: "AI Brain", icon: "✨" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

const BRANDS: Brand[] = ["mattys_place", "ash_shahada", "reliance", "tenant_hub"];
const SHORT: Record<Brand, string> = {
  mattys_place: "Matty's",
  ash_shahada: "Ash Shahada",
  reliance: "Reliance",
  tenant_hub: "Tenant Hub Workspace",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { brand, setBrand } = useBrand();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      {/* ── TOPBAR ─────────────────────────────────────────────── */}
      <header
        className="flex items-center gap-4 px-4 shrink-0 bg-white border-b border-slate-200 z-50"
        style={{
          height: "64px",
        }}
      >
        <button
          className="md:hidden flex items-center justify-center w-8 h-8 rounded text-slate-600 hover:bg-slate-100 shrink-0 transition-colors"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          ☰
        </button>
        <Link href="/dashboard" className="shrink-0 group" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
          <span
            className="shadow-sm transition-transform group-hover:scale-105"
            style={{
              width: "32px", height: "32px", borderRadius: "10px", background: "var(--accent)",
              color: "#fff", fontWeight: 800, display: "flex", alignItems: "center",
              justifyContent: "center", fontFamily: "'Sora',sans-serif", fontSize: "16px"
            }}
          >
            M
          </span>
          <span className="hidden sm:inline" style={{ color: "var(--text-main)", fontWeight: 700, fontFamily: "'Sora',sans-serif", fontSize: "16px" }}>
            Matty&apos;s Place
          </span>
        </Link>

        {/* Letterhead switcher */}
        <div className="hidden md:flex" style={{ gap: "4px" }}>
          {BRANDS.map((b) => (
            <button
              key={b}
              onClick={() => setBrand(b)}
              title={BRAND_LABELS[b]}
              className="transition-colors hover:-translate-y-[1px]"
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 600,
                fontFamily: "'Sora',sans-serif",
                background: brand === b ? "var(--indigo-50)" : "var(--slate-50)",
                color: brand === b ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              {SHORT[b]}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <Link
          href="/intake/new"
          className="hidden sm:inline-flex shrink-0 transition-transform hover:-translate-y-[1px] shadow-sm"
          style={{
            background: "var(--accent)", color: "#fff", textDecoration: "none",
            padding: "8px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 600,
            fontFamily: "'Sora',sans-serif",
          }}
        >
          + New Tenant
        </Link>

        <span
          className="hidden md:inline shrink-0"
          style={{
            fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", color: "var(--rose-500)",
            background: "var(--rose-50)", padding: "4px 10px", borderRadius: "99px",
          }}
        >
          OFFICIAL USE ONLY
        </span>
      </header>

      {/* ── BODY ───────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 relative">
        {/* SIDEBAR */}
        <nav
          className={`${mobileMenuOpen ? "flex" : "hidden"} md:flex border-r border-slate-200 bg-white`}
          style={{
            width: "280px",
            flexDirection: "column",
            padding: "20px 16px",
            flexShrink: 0,
            position: mobileMenuOpen ? "absolute" : "relative",
            zIndex: 40,
            height: "100%",
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "16px" }}>
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="transition-colors hover:bg-slate-50"
                  style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "10px 12px", borderRadius: "10px", textDecoration: "none",
                    fontSize: "14px", fontFamily: "'Sora',sans-serif",
                    background: active ? "var(--indigo-50)" : "transparent",
                    color: active ? "var(--accent)" : "var(--text-muted)",
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  <span style={{ width: "20px", textAlign: "center", fontSize: "16px" }}>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div style={{ height: "1px", background: "var(--slate-100)", margin: "4px 0 16px" }} />

          {/* Tenant list — single source of truth (H8) */}
          <div className="flex-1 overflow-y-auto min-h-0">
             <TenantSidebar />
          </div>

          {/* User info + sign out */}
          <div style={{ borderTop: "1px solid var(--slate-100)", paddingTop: "16px", marginTop: "16px" }}>
            <div style={{ color: "var(--text-main)", fontSize: "14px", fontWeight: 600 }}>
              {profile?.full_name ?? "—"}
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "12px", marginBottom: "12px", textTransform: "capitalize" }}>
              {profile?.role?.replace("_", " ") ?? ""}
            </div>
            <button
              onClick={signOut}
              className="transition-colors hover:bg-slate-50 hover:text-slate-900"
              style={{
                width: "100%", minHeight: "42px", borderRadius: "10px",
                border: "1px solid var(--slate-200)", background: "transparent",
                color: "var(--text-muted)", fontSize: "13px", cursor: "pointer", fontFamily: "'Sora',sans-serif",
                fontWeight: 600,
              }}
            >
              Sign Out
            </button>
          </div>
        </nav>

        {/* MAIN */}
        <main style={{ flex: 1, minWidth: 0, overflowY: "auto", background: "var(--bg-app)", overscrollBehaviorY: "none" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
