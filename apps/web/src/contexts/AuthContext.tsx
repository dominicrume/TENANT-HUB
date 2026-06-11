/**
 * AuthContext — current user + profile, exposed to the client app.
 * Backed by Supabase onAuthStateChange. Includes a 3s loading watchdog so the
 * UI is NEVER stuck on a spinner (a prototype failure mode): if the profile
 * fetch hangs, we resolve to a signed-out state and let the route guards act.
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
import type { User } from "@supabase/supabase-js";
import type { UserRole } from "@tenant-hub/auth";
import { getSupabaseBrowser } from "../lib/supabase-browser";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  email: string | null;
}

interface AuthValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const settled = useRef(false);

  useEffect(() => {
    const supabase = getSupabaseBrowser();

    // Watchdog — never leave the app stuck loading.
    const watchdog = setTimeout(() => {
      if (!settled.current) setLoading(false);
    }, 3000);

    async function loadProfile(u: User | null) {
      if (!u) {
        setProfile(null);
        return null;
      }
      // Populate immediately from metadata to avoid showing empty values/dashes during load
      const metaName = u.user_metadata?.full_name || u.user_metadata?.name || "";
      const metaRole = u.user_metadata?.role || "support_worker";
      const initialProfile = {
        id: u.id,
        full_name: metaName,
        role: metaRole as any,
        email: u.email ?? null
      };
      setProfile(initialProfile);

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, role, email")
          .eq("id", u.id)
          .single();
        if (error) {
          console.error("AuthContext: loadProfile DB error:", error.message);
          // Keep the initial metadata-based profile if DB read fails
          return initialProfile;
        }
        const p = (data as Profile) ?? null;
        if (p) {
          setProfile(p);
        }
        return p;
      } catch (err) {
        console.error("AuthContext: loadProfile exception:", err);
        return initialProfile;
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        setLoading(true);
        await loadProfile(u);
      } else {
        setProfile(null);
      }
      settled.current = true;
      setLoading(false);
    });

    return () => {
      clearTimeout(watchdog);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await getSupabaseBrowser().auth.signOut();
    setUser(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
