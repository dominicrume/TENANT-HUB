import { NextResponse } from "next/server";
import { getApiAuth } from "../../../../../lib/api-auth";
import { can } from "@tenant-hub/auth";
import { StampStatus } from "@tenant-hub/blockchain";

/**
 * POST /api/stamps/[id]/retry — manually retry a dead-letter stamp.
 * Restores a "dead_letter" row in stamp_queue back to "pending",
 * resetting the retry_count and error fields.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Only admin and manager can manage the stamp queue
  if (!can(auth.actor.user_role, "stamp_queue", "update")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { id } = params;

  // Verify the stamp exists and is dead-letter
  const { data: stamp, error: fetchErr } = await auth.supabase
    .from("stamp_queue")
    .select("status, tenant_id")
    .eq("id", id)
    .single();

  if (fetchErr || !stamp) {
    return NextResponse.json({ error: "Stamp not found" }, { status: 404 });
  }

  if (stamp.status !== "dead_letter") {
    return NextResponse.json({ error: `Cannot retry stamp with status: ${stamp.status}` }, { status: 400 });
  }

  // Update back to pending
  const { error: updateErr } = await auth.supabase
    .from("stamp_queue")
    .update({ 
      status: "pending" as StampStatus, 
      retry_count: 0,
      next_retry_at: null,
      error: null
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Stamp enqueued for retry" });
}
