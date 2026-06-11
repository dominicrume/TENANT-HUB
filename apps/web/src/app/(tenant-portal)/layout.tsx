/**
 * Tenant Portal Layout — warm, mobile-first shell for tenant self-service.
 *
 * Top header with branding + tenant name, sticky bottom nav on mobile,
 * sidebar nav on wider screens. Role-guarded: non-tenant roles redirect
 * to /dashboard.
 */
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "../../contexts/AuthContext";

const NAV = [
  { href: "/my-home",      label: "Home",         icon: "🏠" },
  { href: "/my-ledger",    label: "My Ledger",    icon: "💷" },
  { href: "/report-issue", label: "Report Issue",  icon: "🛠️" },
];

export default function TenantPortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading } = useAuth();

  /* ── Role guard ──────────────────────────────────────────── */
  useEffect(() => {
    if (!loading && profile && profile.role !== "tenant") {
      router.replace("/dashboard");
    }
    if (!loading && !profile) {
      router.replace("/login");
    }
  }, [loading, profile, router]);

  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.loadingPulse}>
          <div style={styles.loadingLogo}>T</div>
          <p style={styles.loadingText}>Loading your portal…</p>
        </div>
      </div>
    );
  }

  if (!profile || profile.role !== "tenant") return null;

  const firstName = profile.full_name?.split(" ")[0] ?? "there";

  return (
    <div style={styles.shell}>
      {/* ── TOP HEADER ──────────────────────────────────────── */}
      <header style={styles.header}>
        <Link href="/my-home" style={styles.brandLink}>
          <span style={styles.logoMark}>T</span>
          <span style={styles.logoText}>Tenant Hub</span>
        </Link>
        <div style={{ flex: 1 }} />
        <div style={styles.userBadge}>
          <span style={styles.avatar}>{firstName[0]?.toUpperCase()}</span>
          <span style={styles.userName}>{firstName}</span>
        </div>
      </header>

      {/* ── DESKTOP SIDEBAR (hidden on mobile) ──────────────── */}
      <div style={styles.body}>
        <nav style={styles.sidebar} className="tenant-sidebar">
          <div style={styles.sidebarNavGroup}>
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    ...styles.sidebarLink,
                    background: active ? "rgba(232,168,76,0.12)" : "transparent",
                    color: active ? "var(--amber)" : "#8A95A8",
                    fontWeight: active ? 600 : 400,
                    borderLeft: active ? "3px solid var(--amber)" : "3px solid transparent",
                  }}
                >
                  <span style={{ fontSize: "18px", width: "24px", textAlign: "center" }}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div style={{ flex: 1 }} />

          {/* Sign out at bottom of sidebar */}
          <button onClick={handleSignOut} style={styles.sidebarSignOut}>
            🚪 Sign Out
          </button>
        </nav>

        {/* ── MAIN CONTENT ──────────────────────────────────── */}
        <main style={styles.main}>{children}</main>
      </div>

      {/* ── MOBILE BOTTOM NAV (hidden on desktop) ───────────── */}
      <nav style={styles.bottomNav} className="tenant-bottom-nav">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                ...styles.bottomNavItem,
                color: active ? "var(--amber)" : "#8A95A8",
                fontWeight: active ? 700 : 500,
              }}
            >
              <span style={{ fontSize: "22px" }}>{item.icon}</span>
              <span style={{ fontSize: "10px", marginTop: "2px" }}>{item.label}</span>
            </Link>
          );
        })}
        <button onClick={handleSignOut} style={styles.bottomNavSignOut}>
          <span style={{ fontSize: "22px" }}>🚪</span>
          <span style={{ fontSize: "10px", marginTop: "2px" }}>Sign Out</span>
        </button>
      </nav>

      {/* ── RESPONSIVE STYLES (injected via <style>) ────────── */}
      <style>{`
        /* Mobile: show bottom nav, hide sidebar */
        .tenant-sidebar { display: none !important; }
        .tenant-bottom-nav { display: flex !important; }

        @media (min-width: 768px) {
          .tenant-sidebar { display: flex !important; }
          .tenant-bottom-nav { display: none !important; }
        }
      `}</style>
    </div>
  );

  async function handleSignOut() {
    try {
      await fetch("/auth/signout", { method: "POST" });
      const { getSupabaseBrowser } = await import("../../lib/supabase-browser");
      await getSupabaseBrowser().auth.signOut();
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("sb-")) localStorage.removeItem(key);
      });
    } catch (err) {
      console.error("Signout error", err);
    }
    window.location.href = "/login";
  }
}

/* ── Inline styles ────────────────────────────────────────────── */
const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    overflow: "hidden",
    background: "var(--cream)",
  },

  /* Loading */
  loadingScreen: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    background: "var(--cream)",
  },
  loadingPulse: {
    textAlign: "center",
  },
  loadingLogo: {
    width: "56px",
    height: "56px",
    borderRadius: "16px",
    background: "var(--amber)",
    color: "var(--navy)",
    fontWeight: 800,
    fontSize: "28px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Sora',sans-serif",
    marginBottom: "16px",
  },
  loadingText: {
    fontFamily: "'Sora',sans-serif",
    fontSize: "15px",
    color: "#7A8494",
    fontWeight: 500,
  },

  /* Header */
  header: {
    height: "60px",
    background: "var(--navy)",
    display: "flex",
    alignItems: "center",
    padding: "0 16px",
    gap: "12px",
    flexShrink: 0,
  },
  brandLink: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    textDecoration: "none",
  },
  logoMark: {
    width: "34px",
    height: "34px",
    borderRadius: "10px",
    background: "var(--amber)",
    color: "var(--navy)",
    fontWeight: 800,
    fontSize: "18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Sora',sans-serif",
  },
  logoText: {
    color: "#fff",
    fontWeight: 700,
    fontFamily: "'Sora',sans-serif",
    fontSize: "16px",
  },
  userBadge: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  avatar: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    background: "rgba(232,168,76,0.2)",
    color: "var(--amber)",
    fontWeight: 700,
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Sora',sans-serif",
  },
  userName: {
    color: "#C7CFDD",
    fontSize: "14px",
    fontWeight: 500,
    fontFamily: "'Sora',sans-serif",
  },

  /* Body */
  body: {
    display: "flex",
    flex: 1,
    minHeight: 0,
  },

  /* Sidebar (desktop) */
  sidebar: {
    width: "220px",
    background: "var(--navy)",
    flexDirection: "column",
    padding: "16px 12px",
    flexShrink: 0,
  },
  sidebarNavGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  sidebarLink: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 14px",
    borderRadius: "10px",
    textDecoration: "none",
    fontSize: "14px",
    fontFamily: "'Sora',sans-serif",
    transition: "background 0.15s",
  },
  sidebarSignOut: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 14px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "transparent",
    color: "#8A95A8",
    fontSize: "14px",
    fontFamily: "'Sora',sans-serif",
    cursor: "pointer",
    width: "100%",
    marginTop: "8px",
  },

  /* Main */
  main: {
    flex: 1,
    minWidth: 0,
    overflowY: "auto",
    background: "var(--cream)",
    padding: "0",
  },

  /* Bottom nav (mobile) */
  bottomNav: {
    height: "68px",
    background: "var(--navy)",
    justifyContent: "space-around",
    alignItems: "center",
    padding: "6px 0",
    paddingBottom: "env(safe-area-inset-bottom, 6px)",
    flexShrink: 0,
  },
  bottomNavItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textDecoration: "none",
    fontFamily: "'Sora',sans-serif",
    minWidth: "60px",
    padding: "4px 8px",
  },
  bottomNavSignOut: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontFamily: "'Sora',sans-serif",
    color: "#8A95A8",
    background: "none",
    border: "none",
    cursor: "pointer",
    minWidth: "60px",
    padding: "4px 8px",
    fontWeight: 500,
  },
};
