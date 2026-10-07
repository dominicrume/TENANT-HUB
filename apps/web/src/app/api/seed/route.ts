import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { getApiAuth } from "../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../lib/safe-error";

export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  try {
    await writeWithAudit({
      table: "form_templates",
      action: "CREATE",
      record: {
        id: "reliance-support-plan",
        org_id: auth.actor.org_id,
        name: "Reliance Pack: Support Plan",
        key: "reliance-support-plan",
        schema: [],
      } as Record<string, unknown>,
      ...auth.actor,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
