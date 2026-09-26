/**
 * useHealth — the topbar pill's source of truth. Polls /api/health once a minute;
 * live = the worker heartbeat is under two minutes old. The pill is not decorative.
 */
"use client";

import useSWR from "swr";

export interface Health {
  status: "ok" | "degraded";
  db: "ok" | "down";
  worker: "ok" | "stale" | "unknown";
  agents: number;
  workerHeartbeatAgeSeconds: number | null;
  practice: string[];
  ts: string;
}

const fetcher = async (url: string): Promise<Health> => {
  const res = await fetch(url, { cache: "no-store" });
  return res.json() as Promise<Health>;
};

export function useHealth() {
  const { data } = useSWR<Health>("/api/health", fetcher, { refreshInterval: 60_000, revalidateOnFocus: false });
  const live: boolean | null = !data || data.worker === "unknown" ? null : data.worker === "ok";
  return { health: data, live, practice: data?.practice ?? [] };
}
