import { NextResponse } from "next/server";
import { db, deleteWebhook } from "@tenant-hub/db";
import { withRouteHandler } from "../../../../lib/api-handler";

export const dynamic = "force-dynamic";

export const DELETE = withRouteHandler({ resource: "audit_logs", action: "read" }, async (_req, { params }: { params: { id: string } }, auth) => {
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  if (auth.actor.user_role !== "manager" && auth.actor.user_role !== "admin") return NextResponse.json({ error: "Managers only" }, { status: 403 });
  await deleteWebhook(db(), { id: params.id, orgId: auth.actor.org_id });
  return NextResponse.json({ ok: true });
});
