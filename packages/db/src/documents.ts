/**
 * Document bytes (supabase/migrations/045_document_blobs.sql, extended by
 * 057). Deliberately a separate table from the metadata rows
 * (tenant_documents / property_documents / landlord_documents /
 * entity_media): a LIST never pulls file bytes across the wire just to show
 * a name and a date; grids pull the small thumbnail; only the viewer or a
 * download pulls the full file. Every blob carries its SHA-256 — the
 * browser's ETag and the audit trail's "this exact file" — computed here so
 * no upload path can forget it.
 */
import { createHash } from "node:crypto";
import type { Queryable } from "./pool";

export interface DocumentBlobInput {
  orgId: string;
  fileName: string;
  mimeType: string;
  data: Buffer;
  /** ≤320px JPEG made on the device at upload (images only). */
  thumb?: Buffer | null;
  width?: number | null;
  height?: number | null;
}

export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Stores the file's bytes (+ thumbnail, + hash) and returns the new blob's id. */
export async function insertDocumentBlob(client: Queryable, i: DocumentBlobInput): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO document_blobs (org_id, file_name, mime_type, file_size, data, sha256, thumb, width, height)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [i.orgId, i.fileName, i.mimeType, i.data.length, i.data, sha256Hex(i.data), i.thumb ?? null, i.width ?? null, i.height ?? null]);
  return r.rows[0]!.id;
}

export interface DocumentBlob { fileName: string; mimeType: string; data: Buffer; sha256: string | null; fileSize: number }

/** Org-scoped read — returns null for a wrong org as well as a missing id, same as not found. */
export async function getDocumentBlob(client: Queryable, i: { id: string; orgId: string }): Promise<DocumentBlob | null> {
  const r = await client.query<{ file_name: string; mime_type: string; data: Buffer; sha256: string | null; file_size: number }>(
    "SELECT file_name, mime_type, data, sha256, file_size FROM document_blobs WHERE id = $1 AND org_id = $2",
    [i.id, i.orgId]);
  const row = r.rows[0];
  if (!row) return null;
  return { fileName: row.file_name, mimeType: row.mime_type, data: row.data, sha256: row.sha256, fileSize: row.file_size };
}

/** Just the metadata — for a conditional (If-None-Match) response without touching the bytes. */
export async function getDocumentBlobMeta(client: Queryable, i: { id: string; orgId: string }): Promise<{ fileName: string; mimeType: string; sha256: string | null; fileSize: number; hasThumb: boolean } | null> {
  const r = await client.query<{ file_name: string; mime_type: string; sha256: string | null; file_size: number; has_thumb: boolean }>(
    "SELECT file_name, mime_type, sha256, file_size, (thumb IS NOT NULL) AS has_thumb FROM document_blobs WHERE id = $1 AND org_id = $2",
    [i.id, i.orgId]);
  const row = r.rows[0];
  if (!row) return null;
  return { fileName: row.file_name, mimeType: row.mime_type, sha256: row.sha256, fileSize: row.file_size, hasThumb: row.has_thumb };
}

/** The small thumbnail (images only). Null when there is none — the caller shows a type icon instead. */
export async function getDocumentThumb(client: Queryable, i: { id: string; orgId: string }): Promise<{ data: Buffer; sha256: string | null } | null> {
  const r = await client.query<{ thumb: Buffer | null; sha256: string | null }>(
    "SELECT thumb, sha256 FROM document_blobs WHERE id = $1 AND org_id = $2", [i.id, i.orgId]);
  const row = r.rows[0];
  if (!row?.thumb) return null;
  return { data: row.thumb, sha256: row.sha256 };
}

export async function deleteDocumentBlob(client: Queryable, i: { id: string; orgId: string }): Promise<void> {
  await client.query("DELETE FROM document_blobs WHERE id = $1 AND org_id = $2", [i.id, i.orgId]);
}

/** Keep uploads fast and storage sane — same cap enforced at every upload route. */
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15MB
