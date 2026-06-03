/**
 * useTenants — THE single source of truth for tenant data in the UI.
 * Both the stats widget and the sidebar use this hook.
 * They CANNOT disagree on tenant count (H8).
 *
 * Uses TenantRepository from packages/db (never raw supabase calls).
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import type { CanonicalTenant } from "@tenant-hub/validation";

export function useTenants() {
  const [tenants, setTenants] = useState<CanonicalTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // In Sprint 1: replace with TenantRepository.findAll()
      const res = await fetch("/api/tenants");
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
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

  return {
    tenants,
    activeTenants: tenants.filter(t => t.is_active),
    count: tenants.filter(t => t.is_active).length,
    loading,
    error,
    refetch: fetchTenants,
  };
}
