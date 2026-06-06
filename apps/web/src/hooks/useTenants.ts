/**
 * useTenants — THE single source of truth for tenant data in the UI.
 * Both the stats widget and the sidebar use this hook.
 * They CANNOT disagree on tenant count (H8).
 *
 * This is a CLIENT hook, so it must NOT import packages/db (that would drag the
 * service-role client across the boundary). The data path is:
 *   useTenants() → GET /api/tenants → TenantRepository.findAll() → rlsClient
 * One path, one query — no demo-mode divergence (H7).
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import type { CanonicalTenant } from "@tenant-hub/validation";

export function useTenants() {
  const [tenants, setTenants] = useState<CanonicalTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tenants");
      if (!res.ok) {
        // The route returns { error } on 401/500 — surface that, never swallow it.
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
      }
      const data = await res.json() as CanonicalTenant[];
      setTenants(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("useTenants error:", msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchTenants(); }, [fetchTenants]);

  useEffect(() => {
    // We only need the anon key for realtime subscription to work
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return;

    const supabase = createClient(url, anonKey);
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tenants',
        },
        (payload) => {
          console.log("Realtime tenants update:", payload);
          void fetchTenants();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchTenants]);

  const addOptimisticTenant = useCallback((tenant: CanonicalTenant) => {
    setTenants(prev => [tenant, ...prev]);
  }, []);

  const updateOptimisticTenant = useCallback((id: string, updates: Partial<CanonicalTenant>) => {
    setTenants(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  return {
    tenants,
    activeTenants: tenants.filter(t => t.is_active),
    count: tenants.filter(t => t.is_active).length,
    loading,
    error,
    refetch: fetchTenants,
    addOptimisticTenant,
    updateOptimisticTenant,
  };
}
