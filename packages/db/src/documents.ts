/**
 * Document bytes (supabase/migrations/045_document_blobs.sql). Deliberately
 * a separate table from tenant_documents/property_documents, read only by
 * a dedicated download route — a document LIST never pulls file bytes
 * across the wire just to show a name and a date.
 */
import type { Queryable } from "./pool";

export interface DocumentBlobInput {
  orgId: string;
  fileName: string;
  mimeType: string;
  data: Buffer;
}

/** Stores the file's bytes and returns the new blob's id. */
export async function insertDocumentBlob(client: Queryable, i: DocumentBlobInput): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO document_blobs (org_id, file_name, mime_type, file_size, data)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [i.orgId, i.fileName, i.mimeType, i.data.length, i.data]);
  return r.rows[0]!.id;
}

export interface DocumentBlob { fileName: string; mimeType: string; data: Buffer }

/** Org-scoped read — returns null for a wrong org as well as a missing id, same as not found. */
export async function getDocumentBlob(client: Queryable, i: { id: string; orgId: string }): Promise<DocumentBlob | null> {
  const r = await client.query<{ file_name: string; mime_type: string; data: Buffer }>(
    "SELECT file_name, mime_type, data FROM document_blobs WHERE id = $1 AND org_id = $2",
    [i.id, i.orgId]);
  const row = r.rows[0];
  if (!row) return null;
  return { fileName: row.file_name, mimeType: row.mime_type, data: row.data };
}

export async function deleteDocumentBlob(client: Queryable, i: { id: string; orgId: string }): Promise<void> {
  await client.query("DELETE FROM document_blobs WHERE id = $1 AND org_id = $2", [i.id, i.orgId]);
}

/** Keep uploads fast and storage sane — same cap enforced at every upload route. */
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15MB
