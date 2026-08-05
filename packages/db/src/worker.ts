import { adminClient } from "./client";

export async function getPendingStamps(limit: number = 10) {
  const { data, error } = await adminClient
    .from("stamp_queue")
    .select("*")
    .eq("status", "pending")
    .or("next_retry_at.is.null,next_retry_at.lte." + new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function updateStampStatus(id: string, updates: {
  status: "pending" | "processing" | "done" | "failed" | "dead_letter";
  tx_hash?: string;
  error?: string;
  retry_count?: number;
  next_retry_at?: string | null;
}) {
  const { error } = await adminClient
    .from("stamp_queue")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  
  if (error) throw error;
}

/**
 * Reset stale jobs that were left in "processing" state (e.g. after a crash).
 * Called on worker startup to recover from unclean shutdowns.
 */
export async function resetStaleJobs(staleThresholdMinutes: number = 5) {
  const cutoff = new Date(Date.now() - staleThresholdMinutes * 60_000).toISOString();
  const { data, error } = await adminClient
    .from("stamp_queue")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("status", "processing")
    .lt("updated_at", cutoff)
    .select("id");

  if (error) {
    console.error("[worker] Failed to reset stale jobs:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/**
 * Returns aggregate counts for each stamp status — used by the admin dashboard.
 */
export async function getQueueStats(): Promise<{
  pending: number;
  processing: number;
  done: number;
  dead_letter: number;
  failed: number;
}> {
  const statuses = ["pending", "processing", "done", "dead_letter", "failed"] as const;
  const result: Record<string, number> = {};

  for (const status of statuses) {
    const { count, error } = await adminClient
      .from("stamp_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", status);
    result[status] = error ? 0 : (count ?? 0);
  }

  return result as {
    pending: number;
    processing: number;
    done: number;
    dead_letter: number;
    failed: number;
  };
}

/**
 * Returns the count of dead-lettered jobs for alerting.
 */
export async function getDeadLetterCount(): Promise<number> {
  const { count, error } = await adminClient
    .from("stamp_queue")
    .select("*", { count: "exact", head: true })
    .eq("status", "dead_letter");

  if (error) return 0;
  return count ?? 0;
}
