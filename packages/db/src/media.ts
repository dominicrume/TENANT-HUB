/**
 * Photo galleries for properties and rooms (supabase/migrations/050_
 * entity_media.sql). One row per photo, bytes live in document_blobs
 * (045) — same split as every other upload here: a gallery list never
 * pulls image bytes across the wire just to show thumbnails/captions.
 */
import type { Queryable } from "./pool";

export type MediaEntityType = "property" | "unit";

export interface MediaRow {
  id: string;
  entityType: MediaEntityType;
  entityId: string;
  blobId: string;
  caption: string | null;
  uploadedBy: string;
  createdAt: string;
}

export async function insertMedia(
  client: Queryable,
  i: { orgId: string; entityType: MediaEntityType; entityId: string; blobId: string; caption?: string | null; uploadedBy: string },
): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO entity_media (org_id, entity_type, entity_id, blob_id, caption, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [i.orgId, i.entityType, i.entityId, i.blobId, i.caption ?? null, i.uploadedBy]);
  return r.rows[0]!.id;
}

export async function listMedia(client: Queryable, i: { orgId: string; entityType: MediaEntityType; entityId: string }): Promise<MediaRow[]> {
  const r = await client.query<{ id: string; entity_type: MediaEntityType; entity_id: string; blob_id: string; caption: string | null; uploaded_by: string; created_at: string }>(
    `SELECT id, entity_type, entity_id, blob_id, caption, uploaded_by, created_at FROM entity_media
     WHERE org_id = $1 AND entity_type = $2 AND entity_id = $3 ORDER BY created_at DESC`,
    [i.orgId, i.entityType, i.entityId]);
  return r.rows.map((row) => ({ id: row.id, entityType: row.entity_type, entityId: row.entity_id, blobId: row.blob_id, caption: row.caption, uploadedBy: row.uploaded_by, createdAt: row.created_at }));
}

/** Org-scoped — a media row's blob_id, for the file-serving route. Returns null for a wrong org as well as a missing id. */
export async function getMediaBlobId(client: Queryable, i: { id: string; orgId: string }): Promise<string | null> {
  const r = await client.query<{ blob_id: string }>("SELECT blob_id FROM entity_media WHERE id = $1 AND org_id = $2", [i.id, i.orgId]);
  return r.rows[0]?.blob_id ?? null;
}

export async function deleteMedia(client: Queryable, i: { id: string; orgId: string }): Promise<void> {
  await client.query("DELETE FROM entity_media WHERE id = $1 AND org_id = $2", [i.id, i.orgId]);
}
