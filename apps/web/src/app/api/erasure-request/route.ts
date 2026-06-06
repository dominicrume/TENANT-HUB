import { NextResponse } from "next/server";
import { withRouteHandler } from "../../../lib/api-handler";
import { writeWithAudit } from "@tenant-hub/db";

export const POST = withRouteHandler(
  { resource: "tenants", action: "delete", rateLimit: true },
  async (req, _context, auth) => {
    // A tenant requesting their own data deletion
    const { data } = await writeWithAudit({
      table: "tenants",
      record: { id: auth.actor.user_id, is_archived: true } as Record<string, unknown>,
      action: "DELETE",
      entry_method: "MANUAL",
      ...auth.actor,
    });
    
    return NextResponse.json({ success: true, data });
  }
);
