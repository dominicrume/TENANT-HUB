import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../lib/api-handler";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/property-documents/[id] — the landlord came through: attach the
 * file to a "requested" document and flip it to "received" (BUILD_PLAN C51).
 */
export const PATCH = withRouteHandler({ resource: "properties", action: "update" }, async (req, { params }: { params: { id: string } }, auth) => {
  const body = await req.json().catch(() => null);
  if (!body?.file_url || typeof body.file_url !== "string") return NextResponse.json({ error: "file_url is required" }, { status: 422 });

  try {
    const { data } = await writeWithAudit({
      table: "property_documents",
      record: { id: params.id, file_url: body.file_url, status: "received", received_at: new Date().toISOString(), uploaded_by: auth.actor.user_name } as Record<string, unknown>,
      action: "UPDATE", org_id: auth.actor.org_id, ...auth.actor,
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
});
