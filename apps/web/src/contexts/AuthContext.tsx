/**
 * AuthContext — current user + profile, exposed to the client app.
 * Backed by Tenant Hub's own sessions (BUILD_PLAN C31, cut over 2026-10,
 * DECISIONS D27) — /api/auth/verify reads the httpOnly session cookie
 * server-side and returns who's signed in; there's no client SDK session
 * object to subscribe to, so this fetches once on mount. Includes a 3s
 * loading watchdog so the UI is NEVER stuck on a spinner (a prototype
 * failure mode): if the fetch hangs, we resolve to a signed-out state and
 * let the route guards act.
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { UserRole } from "@tenant-hub/auth";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  email: string | null;
  /** The real, active organisation — the only thing that should ever label "which workspace am I in" (see packages/db/src/auth-store.ts). */
  org_id: string | null;
  org_name: string | null;
  /** Which landlord's portfolio this session is looking at (migration 054). Null = all landlords. */
  landlord_id: string | null;
  landlord_name: string | null;
}

interface AuthValue {
  profile: Profile | null;
  loading: boolean;
  /** Re-ask the server who's signed in and which workspace is active (after login, after a workspace switch). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | undefined>(undefined);

type VerifiedUser = { id: string; email: string; role: string; fullName: string; orgId: string | null; orgName: string | null; landlordId?: string | null; landlordName?: string | null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const settled = useRef(false);
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/verify", { cache: "no-store" });
      const body = (r.ok ? await r.json() : { user: null }) as { user: VerifiedUser | null };
      const u = body.user;
      setProfile(u ? { id: u.id, full_name: u.fullName, role: u.role as UserRole, email: u.email, org_id: u.orgId, org_name: u.orgName, landlord_id: u.landlordId ?? null, landlord_name: u.landlordName ?? null } : null);
    } catch {
      // Keep whatever we had (H8): a flaky refetch must not blank the console's
      // name/workspace mid-session. Route guards are server-side anyway.
    } finally {
      settled.current = true;
      setLoading(false);
    }
  }, []);

  // Fetched on mount AND on every client-side navigation. The provider lives
  // above the login and choose-workspace pages, so a client-side login or
  // workspace switch used to leave the first (signed-out) answer in place —
  // the console then read "Tenant Hub / —" instead of the real organisation
  // and person (found on the 2026-10-09 walkthrough). /api/auth/verify is
  // rate-limit exempt and one cheap query, so re-asking per navigation is fine.
  useEffect(() => {
    const watchdog = setTimeout(() => {
      if (!settled.current) setLoading(false);
    }, 3000);
    void refresh();
    return () => clearTimeout(watchdog);
  }, [refresh, pathname]);

  async function signOut() {
    setProfile(null);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {
      console.error("Sign out request failed:", e);
    }
    window.location.replace("/login");
  }

  return (
    <AuthContext.Provider value={{ profile, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
