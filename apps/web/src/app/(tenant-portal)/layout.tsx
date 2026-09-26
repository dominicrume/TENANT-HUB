/**
 * Tenant portal layout — the same console shell the staff use, with three
 * entries in plain words: My home, My money, Report a problem. Role-guarded:
 * non-tenants go to /dashboard, the signed-out go to /login (middleware also
 * confines tenants to these routes).
 */
"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { useBrand } from "../../contexts/BrandContext";
import { Shell, type NavItem } from "../../components/Shell";

const TENANT_NAV: NavItem[] = [
  { href: "/my-home",      label: "My home",          icon: "today",   mobile: true },
  { href: "/my-ledger",    label: "My money",         icon: "rent",    mobile: true },
  { href: "/report-issue", label: "Report a problem", icon: "repairs", mobile: true, short: "Report" },
];

export default function TenantPortalLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { profile, loading, signOut } = useAuth();
  const { label } = useBrand();

  useEffect(() => {
    if (!loading && profile && profile.role !== "tenant") router.replace("/dashboard");
    if (!loading && !profile) router.replace("/login");
  }, [loading, profile, router]);

  if (loading) {
    return (
      <div className="login" aria-busy="true">
        <div style={{ textAlign: "center" }}>
          <div className="mark" style={{ width: 56, height: 56, fontSize: 28, margin: "0 auto 14px" }} aria-hidden="true">{label[0]}</div>
          <p className="sub" style={{ margin: 0 }}>One moment…</p>
        </div>
      </div>
    );
  }
  if (!profile || profile.role !== "tenant") return null;

  return (
    <Shell nav={TENANT_NAV} brand={label} brandSub="Your home" user={profile.full_name || "You"} role="tenant" settingsHref={null} onSignOut={() => void signOut()}>
      {children}
    </Shell>
  );
}
