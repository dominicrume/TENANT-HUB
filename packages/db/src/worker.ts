import { adminClient } from "./client";

export async function getPendingStamps(limit: number = 10) {
  const { data, error } = await adminClient
    .from("stamp_queue")
    .select("*")
    .eq("status", "pending")
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
}) {
  const { error } = await adminClient
    .from("stamp_queue")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  
  if (error) throw error;
}
