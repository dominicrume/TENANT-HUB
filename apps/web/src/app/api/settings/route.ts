import { NextResponse } from "next/server";
import { db, writeWithAudit } from "@tenant-hub/db";
import { getApiAuth } from "../../../lib/api-auth";
import type { AuditEntry } from "@tenant-hub/audit";

import { SettingsUpdateSchema } from "@tenant-hub/validation";
import { toSafeErrorMessage } from "../../../lib/safe-error";

interface SettingsRow { id: string; brand: string; service_charge_default: string; updated_at: string }

/**
 * `settings` (supabase/migrations/005) is keyed by `brand`, NOT org_id - it
 * genuinely has no org_id column. One row per brand (mattys_place,
 * ash_shahada, reliance), not per organisation: these are the three brands
 * this single client runs, not separate SaaS tenants. Supabase RLS never
 * scoped it either (migration 028: "settings_read_all" USING (true), any
 * authenticated user could read every brand's row) - so there is no
 * per-tenant isolation to replicate here; this mirrors that as-is.
 */
export async function GET(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const brand = searchParams.get("brand");

  try {
    const r = brand
      ? await db().query<SettingsRow>("SELECT * FROM settings WHERE brand = $1", [brand])
      : await db().query<SettingsRow>("SELECT * FROM settings");
    return NextResponse.json(r.rows);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (auth.actor.user_role !== "manager") {
    return NextResponse.json({ error: "Forbidden: Only managers can update settings" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = SettingsUpdateSchema.safeParse(body);
  
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.format() }, { status: 400 });
  }

  const { id, service_charge_default } = parsed.data;

  try {
    const { data } = await writeWithAudit({
      table: "settings",
      record: { id, service_charge_default },
      action: "UPDATE" as AuditEntry["action"],
      user_id: auth.actor.user_id,
      user_name: auth.actor.user_name,
      user_role: auth.actor.user_role,
      entry_method: "manual"
    });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: toSafeErrorMessage(error) }, { status: 500 });
  }
}
