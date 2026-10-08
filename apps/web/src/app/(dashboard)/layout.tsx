/**
 * Staff console layout — the Shell around every (dashboard) page.
 * The brand at the top of the rail is the REAL active organisation's name
 * (from the session, which org a multi-org manager switched to is reflected
 * immediately) — not BrandContext, which is a separate, cosmetic document-
 * letterhead preference (stored in localStorage) that never tracked the
 * active org and is why this used to show "Matty's Place" regardless of
 * which workspace was actually signed in. The letterhead switcher itself
 * still lives on the documents that carry it (LetterheadBlock).
 * The "Needs you today" badge shares useNeedsYou() with the Today page (H8).
 * The topbar pill reads /api/health through useHealth(): live when the worker
 * heartbeat is under two minutes old, paused when stale, hidden when unknown.
 */
"use client";

import type { ReactNode } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { Shell, STAFF_NAV } from "../../components/Shell";
import { useNeedsYou } from "../../hooks/useNeedsYou";
import { useHealth } from "../../hooks/useHealth";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const { count } = useNeedsYou();
  const { live, practice } = useHealth();

  return (
    <Shell
      nav={STAFF_NAV}
      brand={profile?.org_name ?? "Tenant Hub"}
      user={profile?.full_name ?? "—"}
      role={profile?.role ?? ""}
      needsYou={count}
      live={live}
      practice={practice}
      primaryAction={{ href: "/intake/new", label: "+ New tenant" }}
      secondaryAction={{ href: "/properties?addLandlord=1", label: "+ Add landlord" }}
      onSignOut={() => void signOut()}
    >
      {children}
    </Shell>
  );
}
