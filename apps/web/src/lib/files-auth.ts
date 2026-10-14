import { NextResponse } from "next/server";
import { can } from "@tenant-hub/auth";
import { db, type FileEntity, type FileItem } from "@tenant-hub/db";

/** The shape the grid renders: a FileItem plus its view / download / thumbnail URLs. */
export function withUrls(f: FileItem) {
  return {
    ...f,
    url: f.blobId ? `/api/files/${f.blobId}` : null,
    downloadUrl: f.blobId ? `/api/files/${f.blobId}?download=1` : null,
    thumbUrl: f.blobId && f.hasThumb ? `/api/files/${f.blobId}/thumb` : null,
  };
}
import { getApiAuth, type ApiAuth } from "./api-auth";

/**
 * Shared guard for the file layer (docs/FILES_SPEC.md §4): who's asking,
 * which organisation, and does the thing they're touching belong to it.
 * Tenant files sit under the `tenants` RBAC resource; property, room and
 * landlord files under `properties` — the same resources their pages use.
 */
export const FILE_ENTITIES: FileEntity[] = ["tenant", "property", "unit", "landlord"];

export async function fileAuth(entity: FileEntity, action: "read" | "create" | "update" | "delete"): Promise<{ auth: ApiAuth; orgId: string } | NextResponse> {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!auth.actor.org_id) return NextResponse.json({ error: "No organisation on this account" }, { status: 400 });
  const resource = entity === "tenant" ? "tenants" : "properties";
  if (!can(auth.actor.user_role, resource, action)) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  return { auth, orgId: auth.actor.org_id };
}

/** Does this entity exist in this organisation? */
export async function entityOwned(entity: FileEntity, id: string, orgId: string): Promise<boolean> {
  const sql = entity === "tenant" ? "SELECT 1 FROM tenants WHERE id = $1 AND org_id = $2"
    : entity === "property" ? "SELECT 1 FROM properties WHERE id = $1 AND org_id = $2"
    : entity === "unit" ? "SELECT 1 FROM units WHERE id = $1 AND org_id = $2"
    : "SELECT 1 FROM landlords WHERE id = $1 AND org_id = $2";
  const r = await db().query(sql, [id, orgId]);
  return (r.rowCount ?? 0) > 0;
}

export function isUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
