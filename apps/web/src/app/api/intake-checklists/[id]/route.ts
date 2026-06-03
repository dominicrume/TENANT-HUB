import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { CHECKLIST_ITEMS } from "@tenant-hub/validation";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../../lib/api-auth";

/** PATCH /api/intake-checklists/[id] — toggle checklist items (writeWithAudit). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "intake_checklists", "update")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { data: existing } = await auth.supabase
    .from("intake_checklists")
    .select("tenant_id")
    .eq("id", params.id)
    .single();

  const body = await req.json().catch(() => ({}));
  const record: Record<string, unknown> = { id: params.id };
  for (const k of CHECKLIST_ITEMS) if (k in body) record[k] = Boolean(body[k]);

  try {
    const { data } = await writeWithAudit({
      table: "intake_checklists",
      record,
      action: "UPDATE",
      tenant_id: (existing?.tenant_id as string | undefined) ?? undefined,
      ...auth.actor,
    });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
