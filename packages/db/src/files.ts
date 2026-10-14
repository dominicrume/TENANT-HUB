/**
 * The file layer's reads (docs/FILES_SPEC.md, migration 057): one shape for
 * every photo and document a tenant, property, room or landlord holds, the
 * manager's estate-wide overview, and expiring share links. Writes to the
 * metadata rows go through writeWithAudit in the API (H1); this module is
 * SELECTs plus the few non-audited counters (share opens).
 */
import type { Queryable } from "./pool";

export type FileEntity = "tenant" | "property" | "unit" | "landlord";
export type FileKind = "photo" | "document";

export interface FileItem {
  /** The metadata row id (entity_media / tenant_documents / property_documents / landlord_documents). */
  id: string;
  kind: FileKind;
  /** Which table the row lives in — the API needs it for PATCH/DELETE. */
  table: "entity_media" | "tenant_documents" | "property_documents" | "landlord_documents";
  entity: FileEntity;
  entityId: string;
  blobId: string | null;
  /** Document type for documents, caption for photos. */
  name: string;
  fileName: string | null;
  mimeType: string | null;
  size: number | null;
  sha256: string | null;
  hasThumb: boolean;
  isCover: boolean;
  status: "received" | "requested";
  uploadedBy: string | null;
  createdAt: string;
  expiresOn: string | null;
  /** Tenant documents only: which of the seven sign-up sections (1–7) it belongs to. */
  section: number | null;
}

type Raw = {
  id: string; kind: FileKind; tbl: FileItem["table"]; entity: FileEntity; entity_id: string; blob_id: string | null; name: string;
  file_name: string | null; mime_type: string | null; file_size: number | null; sha256: string | null; has_thumb: boolean | null; is_cover: boolean | null;
  status: string | null; uploaded_by: string | null; created_at: string; expires_on: string | null; section?: number | null;
};
const map = (r: Raw): FileItem => ({
  id: r.id, kind: r.kind, table: r.tbl, entity: r.entity, entityId: r.entity_id, blobId: r.blob_id, name: r.name,
  fileName: r.file_name, mimeType: r.mime_type, size: r.file_size === null ? null : Number(r.file_size), sha256: r.sha256, hasThumb: Boolean(r.has_thumb), isCover: Boolean(r.is_cover),
  status: r.status === "requested" ? "requested" : "received", uploadedBy: r.uploaded_by, createdAt: r.created_at, expiresOn: r.expires_on, section: r.section ?? null,
});

const BLOB_COLS = "b.file_name, b.mime_type, b.file_size, b.sha256, (b.thumb IS NOT NULL) AS has_thumb";

/** Every file one thing holds: photos first (cover first), then documents, newest first. */
export async function listEntityFiles(client: Queryable, i: { orgId: string; entity: FileEntity; id: string }): Promise<FileItem[]> {
  const out: Raw[] = [];
  if (i.entity === "property" || i.entity === "unit") {
    const r = await client.query<Raw>(
      `SELECT m.id, 'photo' AS kind, 'entity_media' AS tbl, m.entity_type AS entity, m.entity_id, m.blob_id, COALESCE(m.caption, '') AS name,
              ${BLOB_COLS}, m.is_cover, 'received' AS status, m.uploaded_by, m.created_at, NULL::date AS expires_on
       FROM entity_media m JOIN document_blobs b ON b.id = m.blob_id
       WHERE m.org_id = $1 AND m.entity_type = $2 AND m.entity_id = $3
       ORDER BY m.is_cover DESC, m.sort_order ASC, m.created_at DESC`, [i.orgId, i.entity, i.id]);
    out.push(...r.rows);
  }
  if (i.entity === "property") {
    const r = await client.query<Raw>(
      `SELECT d.id, 'document' AS kind, 'property_documents' AS tbl, 'property' AS entity, d.property_id AS entity_id, d.blob_id, d.document_type AS name,
              ${BLOB_COLS}, FALSE AS is_cover, d.status, d.uploaded_by, d.created_at, NULL::date AS expires_on
       FROM property_documents d LEFT JOIN document_blobs b ON b.id = d.blob_id
       WHERE d.org_id = $1 AND d.property_id = $2 ORDER BY d.created_at DESC`, [i.orgId, i.id]);
    out.push(...r.rows);
  }
  if (i.entity === "tenant") {
    const r = await client.query<Raw>(
      `SELECT d.id, 'document' AS kind, 'tenant_documents' AS tbl, 'tenant' AS entity, d.tenant_id AS entity_id, d.blob_id, d.name,
              ${BLOB_COLS}, FALSE AS is_cover, 'received' AS status, d.uploaded_by, d.created_at, NULL::date AS expires_on, d.section
       FROM tenant_documents d JOIN tenants t ON t.id = d.tenant_id LEFT JOIN document_blobs b ON b.id = d.blob_id
       WHERE t.org_id = $1 AND d.tenant_id = $2 ORDER BY d.created_at DESC`, [i.orgId, i.id]);
    out.push(...r.rows);
  }
  if (i.entity === "landlord") {
    const r = await client.query<Raw>(
      `SELECT d.id, 'document' AS kind, 'landlord_documents' AS tbl, 'landlord' AS entity, d.landlord_id AS entity_id, d.blob_id, d.document_type AS name,
              ${BLOB_COLS}, FALSE AS is_cover, 'received' AS status, d.uploaded_by, d.created_at, d.expires_on
       FROM landlord_documents d LEFT JOIN document_blobs b ON b.id = d.blob_id
       WHERE d.org_id = $1 AND d.landlord_id = $2 ORDER BY d.created_at DESC`, [i.orgId, i.id]);
    out.push(...r.rows);
  }
  return out.map(map);
}

/** Which metadata row does a blob belong to, for an org — the permission check behind /api/files/[blobId]. */
export async function blobBelongsToOrg(client: Queryable, i: { blobId: string; orgId: string }): Promise<boolean> {
  const r = await client.query("SELECT 1 FROM document_blobs WHERE id = $1 AND org_id = $2", [i.blobId, i.orgId]);
  return (r.rowCount ?? 0) > 0;
}

/* ── Landlord documents ─────────────────────────────────────────────────── */
export async function landlordOwned(client: Queryable, i: { landlordId: string; orgId: string }): Promise<boolean> {
  const r = await client.query("SELECT 1 FROM landlords WHERE id = $1 AND org_id = $2", [i.landlordId, i.orgId]);
  return (r.rowCount ?? 0) > 0;
}

/* ── Share links ────────────────────────────────────────────────────────── */
export interface ShareRow { id: string; blobId: string; label: string | null; expiresAt: string; createdBy: string; createdAt: string; revokedAt: string | null; openCount: number; lastOpenedAt: string | null; fileName: string; mimeType: string; size: number }

export async function insertShare(client: Queryable, i: { orgId: string; blobId: string; tokenHash: string; label?: string | null; days: number; createdBy: string }): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO file_shares (org_id, blob_id, token_hash, label, expires_at, created_by)
     VALUES ($1, $2, $3, $4, NOW() + ($5 || ' days')::interval, $6) RETURNING id`,
    [i.orgId, i.blobId, i.tokenHash, i.label ?? null, String(i.days), i.createdBy]);
  return r.rows[0]!.id;
}

export async function listShares(client: Queryable, orgId: string, blobId?: string): Promise<ShareRow[]> {
  const r = await client.query<{ id: string; blob_id: string; label: string | null; expires_at: string; created_by: string; created_at: string; revoked_at: string | null; open_count: number; last_opened_at: string | null; file_name: string; mime_type: string; file_size: number }>(
    `SELECT s.id, s.blob_id, s.label, s.expires_at, s.created_by, s.created_at, s.revoked_at, s.open_count, s.last_opened_at, b.file_name, b.mime_type, b.file_size
     FROM file_shares s JOIN document_blobs b ON b.id = s.blob_id
     WHERE s.org_id = $1 AND ($2::uuid IS NULL OR s.blob_id = $2) ORDER BY s.created_at DESC LIMIT 100`, [orgId, blobId ?? null]);
  return r.rows.map((x) => ({ id: x.id, blobId: x.blob_id, label: x.label, expiresAt: x.expires_at, createdBy: x.created_by, createdAt: x.created_at, revokedAt: x.revoked_at, openCount: Number(x.open_count), lastOpenedAt: x.last_opened_at, fileName: x.file_name, mimeType: x.mime_type, size: Number(x.file_size) }));
}

export async function revokeShare(client: Queryable, i: { id: string; orgId: string }): Promise<void> {
  await client.query("UPDATE file_shares SET revoked_at = NOW() WHERE id = $1 AND org_id = $2 AND revoked_at IS NULL", [i.id, i.orgId]);
}

/** Resolves a live share to its blob (any org — the token IS the credential) and counts the open. */
export async function openShare(client: Queryable, tokenHash: string): Promise<{ blobId: string; orgId: string; label: string | null; expiresAt: string } | null> {
  const r = await client.query<{ blob_id: string; org_id: string; label: string | null; expires_at: string }>(
    `UPDATE file_shares SET open_count = open_count + 1, last_opened_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
     RETURNING blob_id, org_id, label, expires_at`, [tokenHash]);
  const row = r.rows[0];
  return row ? { blobId: row.blob_id, orgId: row.org_id, label: row.label, expiresAt: row.expires_at } : null;
}

/** Same lookup without counting — for the share page's first paint. */
export async function peekShare(client: Queryable, tokenHash: string): Promise<{ blobId: string; orgId: string; label: string | null; expiresAt: string; fileName: string; mimeType: string; size: number } | null> {
  const r = await client.query<{ blob_id: string; org_id: string; label: string | null; expires_at: string; file_name: string; mime_type: string; file_size: number }>(
    `SELECT s.blob_id, s.org_id, s.label, s.expires_at, b.file_name, b.mime_type, b.file_size FROM file_shares s JOIN document_blobs b ON b.id = s.blob_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()`, [tokenHash]);
  const row = r.rows[0];
  return row ? { blobId: row.blob_id, orgId: row.org_id, label: row.label, expiresAt: row.expires_at, fileName: row.file_name, mimeType: row.mime_type, size: Number(row.file_size) } : null;
}

/* ── The manager's overview ─────────────────────────────────────────────── */
export interface FilesOverview {
  totals: { files: number; photos: number; documents: number; bytes: number };
  byLandlord: Array<{ landlordId: string | null; landlord: string; properties: number; photos: number; documents: number; bytes: number }>;
  recent: Array<{ kind: FileKind; name: string; where: string; whereHref: string; uploadedBy: string | null; createdAt: string; blobId: string | null; hasThumb: boolean; mimeType: string | null }>;
  missing: {
    tenants: Array<{ id: string; name: string; room: string | null; missing: string[] }>;
    properties: Array<{ id: string; name: string; missing: string[] }>;
    landlords: Array<{ id: string; name: string; missing: string[] }>;
  };
}

export async function filesOverview(client: Queryable, i: { orgId: string; tenantRequired: readonly string[]; propertyRequired: readonly string[]; landlordRequired: readonly string[] }): Promise<FilesOverview> {
  const org = i.orgId;
  const totals = await client.query<{ photos: string; documents: string; bytes: string }>(
    `SELECT
       (SELECT count(*) FROM entity_media WHERE org_id = $1) AS photos,
       (SELECT count(*) FROM tenant_documents d JOIN tenants t ON t.id = d.tenant_id WHERE t.org_id = $1 AND d.blob_id IS NOT NULL)
       + (SELECT count(*) FROM property_documents WHERE org_id = $1 AND blob_id IS NOT NULL)
       + (SELECT count(*) FROM landlord_documents WHERE org_id = $1 AND blob_id IS NOT NULL) AS documents,
       (SELECT COALESCE(sum(file_size), 0) FROM document_blobs WHERE org_id = $1) AS bytes`, [org]);
  const t = totals.rows[0]!;

  const byLandlord = await client.query<{ landlord_id: string | null; landlord: string; properties: string; photos: string; documents: string; bytes: string }>(
    `SELECT p.landlord_id, COALESCE(l.name, 'Landlord not set') AS landlord, count(DISTINCT p.id) AS properties,
            (SELECT count(*) FROM entity_media m WHERE m.org_id = $1 AND ((m.entity_type = 'property' AND m.entity_id IN (SELECT id FROM properties WHERE org_id = $1 AND landlord_id IS NOT DISTINCT FROM p.landlord_id))
                                                                        OR (m.entity_type = 'unit' AND m.entity_id IN (SELECT u.id FROM units u JOIN properties pp ON pp.id = u.property_id WHERE pp.org_id = $1 AND pp.landlord_id IS NOT DISTINCT FROM p.landlord_id)))) AS photos,
            (SELECT count(*) FROM property_documents d WHERE d.org_id = $1 AND d.blob_id IS NOT NULL AND d.property_id IN (SELECT id FROM properties WHERE org_id = $1 AND landlord_id IS NOT DISTINCT FROM p.landlord_id)) AS documents,
            (SELECT COALESCE(sum(b.file_size), 0) FROM document_blobs b WHERE b.id IN (
               SELECT m.blob_id FROM entity_media m WHERE m.org_id = $1 AND m.entity_type = 'property' AND m.entity_id IN (SELECT id FROM properties WHERE org_id = $1 AND landlord_id IS NOT DISTINCT FROM p.landlord_id)
               UNION SELECT d.blob_id FROM property_documents d WHERE d.org_id = $1 AND d.blob_id IS NOT NULL AND d.property_id IN (SELECT id FROM properties WHERE org_id = $1 AND landlord_id IS NOT DISTINCT FROM p.landlord_id))) AS bytes
     FROM properties p LEFT JOIN landlords l ON l.id = p.landlord_id
     WHERE p.org_id = $1 GROUP BY p.landlord_id, l.name ORDER BY l.name NULLS LAST`, [org]);

  const recent = await client.query<{ kind: FileKind; name: string; where_: string; href: string; uploaded_by: string | null; created_at: string; blob_id: string | null; has_thumb: boolean; mime_type: string | null }>(
    `SELECT * FROM (
       SELECT 'photo'::text AS kind, COALESCE(NULLIF(m.caption, ''), 'Photo') AS name,
              CASE WHEN m.entity_type = 'property' THEN (SELECT name FROM properties WHERE id = m.entity_id) ELSE (SELECT pp.name || ' · ' || u.reference FROM units u JOIN properties pp ON pp.id = u.property_id WHERE u.id = m.entity_id) END AS where_,
              CASE WHEN m.entity_type = 'property' THEN '/properties/' || m.entity_id ELSE '/properties/' || (SELECT property_id FROM units WHERE id = m.entity_id) END AS href,
              m.uploaded_by, m.created_at, m.blob_id, (b.thumb IS NOT NULL) AS has_thumb, b.mime_type
       FROM entity_media m JOIN document_blobs b ON b.id = m.blob_id WHERE m.org_id = $1
       UNION ALL
       SELECT 'document', d.name, t.full_name, '/tenants/' || t.id, d.uploaded_by, d.created_at, d.blob_id, (b.thumb IS NOT NULL), b.mime_type
       FROM tenant_documents d JOIN tenants t ON t.id = d.tenant_id LEFT JOIN document_blobs b ON b.id = d.blob_id WHERE t.org_id = $1 AND d.blob_id IS NOT NULL
       UNION ALL
       SELECT 'document', d.document_type, p.name, '/properties/' || p.id, d.uploaded_by, d.created_at, d.blob_id, (b.thumb IS NOT NULL), b.mime_type
       FROM property_documents d JOIN properties p ON p.id = d.property_id LEFT JOIN document_blobs b ON b.id = d.blob_id WHERE d.org_id = $1 AND d.blob_id IS NOT NULL
       UNION ALL
       SELECT 'document', d.document_type, l.name, '/landlords/' || l.id, d.uploaded_by, d.created_at, d.blob_id, (b.thumb IS NOT NULL), b.mime_type
       FROM landlord_documents d JOIN landlords l ON l.id = d.landlord_id LEFT JOIN document_blobs b ON b.id = d.blob_id WHERE d.org_id = $1 AND d.blob_id IS NOT NULL
     ) x ORDER BY created_at DESC LIMIT 20`, [org]);

  // Missing required documents, by name match on what's been filed (case-insensitive, the way the dropdown names them).
  const tenants = await client.query<{ id: string; full_name: string; room_number: string | null; have: string[] | null }>(
    `SELECT t.id, t.full_name, t.room_number, (SELECT array_agg(lower(d.name)) FROM tenant_documents d WHERE d.tenant_id = t.id AND d.blob_id IS NOT NULL) AS have
     FROM tenants t WHERE t.org_id = $1 AND t.is_active = true AND t.is_archived = false ORDER BY t.full_name`, [org]);
  const properties = await client.query<{ id: string; name: string; have: string[] | null }>(
    `SELECT p.id, p.name, (SELECT array_agg(lower(d.document_type)) FROM property_documents d WHERE d.property_id = p.id AND d.blob_id IS NOT NULL) AS have
     FROM properties p WHERE p.org_id = $1 ORDER BY p.name`, [org]);
  const landlords = await client.query<{ id: string; name: string; have: string[] | null }>(
    `SELECT l.id, l.name, (SELECT array_agg(lower(d.document_type)) FROM landlord_documents d WHERE d.landlord_id = l.id AND d.blob_id IS NOT NULL) AS have
     FROM landlords l WHERE l.org_id = $1 ORDER BY l.name`, [org]);
  const missingOf = (have: string[] | null, required: readonly string[]) => {
    const h = (have ?? []).map((x) => x.toLowerCase());
    return required.filter((req) => !h.some((x) => x === req.toLowerCase() || x.startsWith(req.toLowerCase())));
  };

  return {
    totals: { photos: Number(t.photos), documents: Number(t.documents), files: Number(t.photos) + Number(t.documents), bytes: Number(t.bytes) },
    byLandlord: byLandlord.rows.map((r) => ({ landlordId: r.landlord_id, landlord: r.landlord, properties: Number(r.properties), photos: Number(r.photos), documents: Number(r.documents), bytes: Number(r.bytes) })),
    recent: recent.rows.map((r) => ({ kind: r.kind, name: r.name, where: r.where_ ?? "", whereHref: r.href ?? "/", uploadedBy: r.uploaded_by, createdAt: r.created_at, blobId: r.blob_id, hasThumb: Boolean(r.has_thumb), mimeType: r.mime_type })),
    missing: {
      tenants: tenants.rows.map((r) => ({ id: r.id, name: r.full_name, room: r.room_number, missing: missingOf(r.have, i.tenantRequired) })).filter((x) => x.missing.length > 0),
      properties: properties.rows.map((r) => ({ id: r.id, name: r.name, missing: missingOf(r.have, i.propertyRequired) })).filter((x) => x.missing.length > 0),
      landlords: landlords.rows.map((r) => ({ id: r.id, name: r.name, missing: missingOf(r.have, i.landlordRequired) })).filter((x) => x.missing.length > 0),
    },
  };
}
