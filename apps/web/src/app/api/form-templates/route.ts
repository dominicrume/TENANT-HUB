import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { getApiAuth } from "../../../lib/api-auth";
import { toSafeErrorMessage } from "../../../lib/safe-error";

interface FormTemplateRow { id: string; org_id: string; name: string; key: string; schema: unknown; created_at: string }

/** GET /api/form-templates — fetch all templates for org. form_templates.org_id
 * is NOT NULL (supabase/migrations/013) - every template belongs to exactly
 * one organisation, so this is scoped the same as every other org table. */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json([]);

  try {
    const r = await db().query<FormTemplateRow>(
      "SELECT * FROM form_templates WHERE org_id = $1 ORDER BY created_at ASC",
      [auth.actor.org_id],
    );
    return NextResponse.json(r.rows);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

/** POST /api/form-templates — create or update a template. */
export async function POST(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Only managers can modify form schemas
  if (auth.actor.user_role !== "manager") {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || !body.name || !body.key || !body.schema) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
  }

  try {
    // Upsert by (org_id, key) — the unique constraint the original .upsert()
    // relied on. writeWithAudit only upserts by `id`, so look the id up first.
    const existing = await db().query<{ id: string }>(
      "SELECT id FROM form_templates WHERE org_id = $1 AND key = $2",
      [auth.actor.org_id, body.key],
    );
    const record: Record<string, unknown> = {
      org_id: auth.actor.org_id,
      name: body.name,
      key: body.key,
      schema: body.schema,
    };
    if (existing.rows[0]) record.id = existing.rows[0].id;

    const { data } = await writeWithAudit({
      table: "form_templates",
      record,
      action: existing.rows[0] ? "UPDATE" : "CREATE",
      org_id: auth.actor.org_id,
      user_id: auth.actor.user_id,
      user_name: auth.actor.user_name,
      user_role: auth.actor.user_role,
    });
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("[form-templates:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
