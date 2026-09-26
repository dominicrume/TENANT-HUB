import { NextResponse } from "next/server";
import { db, hasDatabaseUrl, workerHeartbeatAge } from "@tenant-hub/db";
import { practiceMode } from "@tenant-hub/adapters";
import { createSupabaseServer } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — is the database reachable, is the worker alive, what is
 * still in practice mode. `worker: "stale"` means no agent has heartbeated for
 * two minutes; the topbar pill turns amber. Never cached.
 */
export async function GET() {
  const ts = new Date().toISOString();
  const practice = practiceMode();
  try {
    if (hasDatabaseUrl()) {
      const { ageSeconds, agents } = await workerHeartbeatAge(db());
      const worker = ageSeconds === null ? "unknown" : ageSeconds < 120 ? "ok" : "stale";
      return NextResponse.json({ status: "ok", db: "ok", worker, agents, workerHeartbeatAgeSeconds: ageSeconds, practice, ts }, { headers: { "Cache-Control": "no-store" } });
    }
    // Legacy path until DATABASE_URL exists (DECISIONS D15): prove the database answers; the worker is unknown.
    const { error } = await createSupabaseServer().from("profiles").select("id").limit(1);
    if (error) throw error;
    return NextResponse.json({ status: "ok", db: "ok", worker: "unknown", agents: 0, workerHeartbeatAgeSeconds: null, practice, ts }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // Supabase throws plain objects, not Errors; keep the real reason.
    const message = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
    return NextResponse.json({ status: "degraded", db: "down", worker: "unknown", agents: 0, workerHeartbeatAgeSeconds: null, practice, error: message, ts }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
