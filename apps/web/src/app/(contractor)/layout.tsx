/**
 * Contractor layout — the same console shell, one screen: My jobs.
 * Contractors never see settings, tenants or money (middleware enforces the route).
 */
"use client";

import type { ReactNode } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { Shell, CONTRACTOR_NAV } from "../../components/Shell";

export default function ContractorLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  return (
    <Shell
      nav={CONTRACTOR_NAV}
      brand={profile?.org_name ?? "Tenant Hub"}
      brandSub="Contractor"
      user={profile?.full_name ?? "—"}
      role={profile?.role ?? "contractor"}
      settingsHref={null}
      onSignOut={() => void signOut()}
    >
      {children}
    </Shell>
  );
}
