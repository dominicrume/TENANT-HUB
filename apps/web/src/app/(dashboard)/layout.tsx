/**
 * Staff console layout — the Shell around every (dashboard) page.
 * The brand at the top of the rail is the active letterhead (BrandContext); the
 * letterhead switcher itself lives on the documents that carry it (LetterheadBlock).
 * The "Needs you today" badge shares useNeedsYou() with the Today page (H8).
 * The topbar pill reads /api/health through useHealth(): live when the worker
 * heartbeat is under two minutes old, paused when stale, hidden when unknown.
 */
"use client";

import type { ReactNode } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useBrand } from "../../contexts/BrandContext";
import { Shell, STAFF_NAV } from "../../components/Shell";
import { useNeedsYou } from "../../hooks/useNeedsYou";
import { useHealth } from "../../hooks/useHealth";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const { label } = useBrand();
  const { count } = useNeedsYou();
  const { live, practice } = useHealth();

  return (
    <Shell
      nav={STAFF_NAV}
      brand={label}
      user={profile?.full_name ?? "—"}
      role={profile?.role ?? ""}
      needsYou={count}
      live={live}
      practice={practice}
      primaryAction={{ href: "/intake/new", label: "+ New tenant" }}
      onSignOut={() => void signOut()}
    >
      {children}
    </Shell>
  );
}
