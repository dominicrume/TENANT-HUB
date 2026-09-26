/**
 * Staff console layout — the Shell around every (dashboard) page.
 * The brand at the top of the rail is the active letterhead (BrandContext); the
 * letterhead switcher itself lives on the documents that carry it (LetterheadBlock).
 * The "Needs you today" count and the agent-health pill are wired in
 * docs/BUILD_PLAN.md C04 and C14.
 */
"use client";

import type { ReactNode } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useBrand } from "../../contexts/BrandContext";
import { Shell, STAFF_NAV } from "../../components/Shell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const { label } = useBrand();

  return (
    <Shell
      nav={STAFF_NAV}
      brand={label}
      user={profile?.full_name ?? "—"}
      role={profile?.role ?? ""}
      primaryAction={{ href: "/intake/new", label: "+ New tenant" }}
      onSignOut={() => void signOut()}
    >
      {children}
    </Shell>
  );
}
