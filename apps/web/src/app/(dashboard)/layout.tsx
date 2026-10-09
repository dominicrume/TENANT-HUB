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

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { Shell, STAFF_NAV, type Workspace } from "../../components/Shell";
import { useNeedsYou } from "../../hooks/useNeedsYou";
import { useHealth } from "../../hooks/useHealth";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { profile, signOut, refresh } = useAuth();
  const { count } = useNeedsYou();
  const { live, practice } = useHealth();
  const router = useRouter();

  // Every workspace this account can work in (migration 046). The topbar
  // shows the active one by name always, and becomes a switcher only when
  // there's genuinely more than one — "it should show me where I am at the
  // moment, and give me the option to switch" (walkthrough 2026-10-09).
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  // Every landlord this account can work for (migration 054) — the topbar
  // chip. Re-read whenever the active org or landlord changes, and when the
  // route changes to /landlords or /properties (that's where new ones get
  // added), so "added internally → available to choose" holds without a
  // re-login.
  const [landlords, setLandlords] = useState<Workspace[]>([]);
  const pathname = usePathname();
  useEffect(() => {
    if (!profile) return;
    fetch("/api/organisations/mine").then((r) => (r.ok ? r.json() : [])).then((d) => setWorkspaces(Array.isArray(d) ? d : [])).catch(() => {});
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!profile) return;
    fetch("/api/landlords/mine").then((r) => (r.ok ? r.json() : [])).then((d) => setLandlords(Array.isArray(d) ? d.map((l: { id: string; name: string }) => ({ id: l.id, name: l.name })) : [])).catch(() => {});
  }, [profile?.id, profile?.org_id, profile?.landlord_id, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  async function switchWorkspace(orgId: string) {
    const res = await fetch("/api/auth/switch-org", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId }) });
    if (!res.ok) return false;
    // A workspace switch clears the landlord (they belong to the old one).
    await fetch("/api/auth/switch-landlord", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ landlordId: null }) }).catch(() => {});
    await refresh();
    router.push("/dashboard");
    router.refresh();
    return true;
  }

  async function switchLandlord(landlordId: string | null) {
    const res = await fetch("/api/auth/switch-landlord", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ landlordId }) });
    if (!res.ok) return false;
    await refresh();
    router.push(landlordId ? `/landlords/${landlordId}` : "/landlords");
    router.refresh();
    return true;
  }

  return (
    <Shell
      nav={STAFF_NAV}
      // The rail names WHOSE portfolio you're in: the landlord when one is
      // picked (Rume, 2026-10-10: "we're in Dawson and Reliance is still
      // showing at the top — bad"); the organisation only when looking at
      // all landlords.
      brand={profile?.landlord_name ?? profile?.org_name ?? "Tenant Hub"}
      brandSub={profile?.landlord_name ? `Landlord · ${profile.org_name ?? "Tenant Hub"}` : "Tenant Hub"}
      user={profile?.full_name ?? "—"}
      role={profile?.role ?? ""}
      workspaces={workspaces}
      activeWorkspaceId={profile?.org_id ?? null}
      onSwitchWorkspace={switchWorkspace}
      landlords={landlords}
      activeLandlordId={profile?.landlord_id ?? null}
      onSwitchLandlord={switchLandlord}
      avatar={{
        src: "/api/profiles/me/photo",
        onUpload: async (file) => {
          const fd = new FormData(); fd.append("file", file);
          const r = await fetch("/api/profiles/me/photo", { method: "POST", body: fd });
          if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.error ?? "Photo did not save"); }
        },
        onRemove: async () => {
          const r = await fetch("/api/profiles/me/photo", { method: "DELETE" });
          if (!r.ok) throw new Error("Could not remove the photo");
        },
      }}
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
