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
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role, email")
        .eq("id", u.id)
        .single();
      setProfile((data as Profile) ?? null);
    }

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      await loadProfile(u);
      settled.current = true;
      setLoading(false);
    });

    // Kick an initial read in case the listener doesn't fire immediately.
    supabase.auth.getUser().then(async ({ data }) => {
      if (settled.current) return;
      setUser(data.user);
      await loadProfile(data.user);
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
