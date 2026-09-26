/**
 * useNeedsYou — one SWR key shared by the Today page and the nav badge, so the
 * count in the rail always equals the list on the page (H8). A background
 * revalidation keeps the previous data on screen; it never blanks the list.
 */
"use client";

import useSWR from "swr";
import type { NeedsYouResponse } from "../lib/needs-you";

const fetcher = async (url: string): Promise<NeedsYouResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<NeedsYouResponse>;
};

export function useNeedsYou() {
  const { data, error, isLoading, mutate } = useSWR<NeedsYouResponse>("/api/needs-you", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });
  return { data, error: error as Error | undefined, loading: isLoading && !data, refresh: () => void mutate(), count: data?.items.length ?? 0 };
}
