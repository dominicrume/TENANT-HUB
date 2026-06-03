import { NextResponse } from "next/server";
import { writeWithAudit } from "@tenant-hub/db";
import { CHECKLIST_ITEMS } from "@tenant-hub/validation";
import { can } from "@tenant-hub/auth";
import { getApiAuth } from "../../../lib/api-auth";

function defaultItems() {
  return Object.fromEntries(CHECKLIST_ITEMS.map((k) => [k, false]));
}

/** GET /api/intake-checklists?tenantId — existing row, or an unsaved default. */
export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const tenantId = new URL(req.url).searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  const { data, error } = await auth.supabase
    .from("intake_checklists")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? { id: null, tenant_id: tenantId, ...defaultItems() });
}

/** POST /api/intake-checklists — create the checklist row for a tenant. */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!can(auth.actor.user_role, "intake_checklists", "create")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.tenant_id) return NextResponse.json({ error: "tenant_id required" }, { status: 422 });

  const record: Record<string, unknown> = { tenant_id: body.tenant_id, ...defaultItems() };
  for (const k of CHECKLIST_ITEMS) if (k in body) record[k] = Boolean(body[k]);

  try {
    const { data } = await writeWithAudit({
      table: "intake_checklists",
      record,
      action: "CREATE",
      tenant_id: body.tenant_id,
      ...auth.actor,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
