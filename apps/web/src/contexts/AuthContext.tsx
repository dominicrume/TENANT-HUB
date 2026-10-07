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
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { UserRole } from "@tenant-hub/auth";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  email: string | null;
  /** The real, active organisation's name — the only thing that should ever label "which workspace am I in" (see packages/db/src/auth-store.ts). */
  org_name: string | null;
}

interface AuthValue {
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const settled = useRef(false);

  useEffect(() => {
    const watchdog = setTimeout(() => {
      if (!settled.current) setLoading(false);
    }, 3000);

    fetch("/api/auth/verify")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((body: { user: { id: string; email: string; role: string; fullName: string; orgName: string | null } | null }) => {
        const u = body.user;
        setProfile(u ? { id: u.id, full_name: u.fullName, role: u.role as UserRole, email: u.email, org_name: u.orgName } : null);
      })
      .catch(() => setProfile(null))
      .finally(() => {
        settled.current = true;
        setLoading(false);
      });

    return () => clearTimeout(watchdog);
  }, []);

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
    <AuthContext.Provider value={{ profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
