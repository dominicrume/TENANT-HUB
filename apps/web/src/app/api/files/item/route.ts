import { NextResponse } from "next/server";
import { db, writeWithAudit, deleteMedia, deleteDocumentBlob, type FileEntity } from "@tenant-hub/db";
import { toSafeErrorMessage } from "../../../../lib/safe-error";
import { fileAuth, isUuid } from "../../../../lib/files-auth";

export const dynamic = "force-dynamic";

type Table = "entity_media" | "tenant_documents" | "property_documents" | "landlord_documents";
const TABLES: Table[] = ["entity_media", "tenant_documents", "property_documents", "landlord_documents"];
const entityOf = (t: Table): FileEntity => (t === "tenant_documents" ? "tenant" : t === "landlord_documents" ? "landlord" : "property");

/** Which org does this metadata row belong to, and what blob does it point at. */
async function locate(table: Table, id: string, orgId: string): Promise<{ blobId: string | null; entityId: string } | null> {
  const sql = table === "entity_media" ? "SELECT blob_id, entity_id FROM entity_media WHERE id = $1 AND org_id = $2"
    : table === "tenant_documents" ? "SELECT d.blob_id, d.tenant_id AS entity_id FROM tenant_documents d JOIN tenants t ON t.id = d.tenant_id WHERE d.id = $1 AND t.org_id = $2"
    : table === "property_documents" ? "SELECT blob_id, property_id AS entity_id FROM property_documents WHERE id = $1 AND org_id = $2"
    : "SELECT blob_id, landlord_id AS entity_id FROM landlord_documents WHERE id = $1 AND org_id = $2";
  const r = await db().query<{ blob_id: string | null; entity_id: string }>(sql, [id, orgId]);
  return r.rows[0] ? { blobId: r.rows[0].blob_id, entityId: r.rows[0].entity_id } : null;
}

/** PATCH { table, id, caption?, type?, isCover? } — rename / retype / caption / make cover. Audited. */
export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => null)) as { table?: Table; id?: string; caption?: string; type?: string; isCover?: boolean; expiresOn?: string | null } | null;
  const table = body?.table;
  if (!table || !TABLES.includes(table) || !isUuid(body?.id)) return NextResponse.json({ error: "table and id are required" }, { status: 400 });
  const guard = await fileAuth(entityOf(table), "update");
  if (guard instanceof NextResponse) return guard;
  try {
    const row = await locate(table, body!.id!, guard.orgId);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const record: Record<string, unknown> = { id: body!.id };
    if (table === "entity_media") {
      if (typeof body?.caption === "string") record["caption"] = body.caption.trim().slice(0, 200) || null;
      if (body?.isCover === true) {
        // One cover per gallery.
        await db().query("UPDATE entity_media SET is_cover = FALSE WHERE org_id = $1 AND entity_id = (SELECT entity_id FROM entity_media WHERE id = $2) AND is_cover", [guard.orgId, body!.id]);
        record["is_cover"] = true;
      }
    } else {
      const col = table === "tenant_documents" ? "name" : "document_type";
      if (typeof body?.type === "string" && body.type.trim()) record[col] = body.type.trim().slice(0, 120);
      if (table === "landlord_documents" && body && "expiresOn" in body) record["expires_on"] = body.expiresOn || null;
    }
    if (Object.keys(record).length === 1) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
    const { data } = await writeWithAudit({ table, record, action: "UPDATE", org_id: guard.orgId, ...(table === "tenant_documents" ? { tenant_id: row.entityId } : {}), ...guard.auth.actor });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}

/** DELETE ?table=&id= — removes the row AND its bytes (an audit row records the removal, with who and when). */
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const table = url.searchParams.get("table") as Table | null;
  const id = url.searchParams.get("id");
  if (!table || !TABLES.includes(table) || !isUuid(id)) return NextResponse.json({ error: "table and id are required" }, { status: 400 });
  const guard = await fileAuth(entityOf(table), "delete");
  if (guard instanceof NextResponse) return guard;
  try {
    const row = await locate(table, id, guard.orgId);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (table === "entity_media") {
      await deleteMedia(db(), { id, orgId: guard.orgId });
    } else {
      await db().query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    }
    if (row.blobId) await deleteDocumentBlob(db(), { id: row.blobId, orgId: guard.orgId });
    // The hash chain keeps a record of the removal itself (what, who, when) even though the row is gone.
    await writeWithAudit({
      table: "documents",
      record: { org_id: guard.orgId, kind: "file_removed", title: `Removed ${table.replace("_", " ")} ${id}`, body: `blob ${row.blobId ?? "none"} removed by ${guard.auth.actor.user_name}`, related_table: table, related_id: id } as Record<string, unknown>,
      action: "CREATE", org_id: guard.orgId, ...guard.auth.actor,
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
