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

  return {
    tenants,
    activeTenants: tenants.filter(t => t.is_active),
    count: tenants.filter(t => t.is_active).length,
    loading,
    error,
    refetch: fetchTenants,
  };
}
