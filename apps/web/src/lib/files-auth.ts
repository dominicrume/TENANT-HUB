import { NextResponse } from "next/server";
import { can } from "@tenant-hub/auth";
import { db, type FileEntity, type FileItem } from "@tenant-hub/db";
import { activeLandlordId } from "./landlord-scope";

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

/**
 * Does this entity exist in this organisation AND fall under the actor's
 * active landlord scope (when one is set)? Overloaded to accept the ApiAuth,
 * so every file route (list, upload, delete) gets the landlord guard for free.
 * All-landlords mode: landlord check is a no-op, behaviour unchanged.
 */
export async function entityOwned(entity: FileEntity, id: string, orgId: string): Promise<boolean>;
export async function entityOwned(entity: FileEntity, id: string, auth: ApiAuth): Promise<boolean>;
export async function entityOwned(entity: FileEntity, id: string, orgIdOrAuth: string | ApiAuth): Promise<boolean> {
  const orgId = typeof orgIdOrAuth === "string" ? orgIdOrAuth : orgIdOrAuth.actor.org_id!;
  const activeLord = typeof orgIdOrAuth === "string" ? null : activeLandlordId(orgIdOrAuth);
  const baseSql = entity === "tenant" ? "SELECT 1 FROM tenants WHERE id = $1 AND org_id = $2"
    : entity === "property" ? "SELECT 1 FROM properties WHERE id = $1 AND org_id = $2"
    : entity === "unit" ? "SELECT 1 FROM units WHERE id = $1 AND org_id = $2"
    : "SELECT 1 FROM landlords WHERE id = $1 AND org_id = $2";
  const r = await db().query(baseSql, [id, orgId]);
  if ((r.rowCount ?? 0) === 0) return false;
  if (!activeLord) return true;

  // Landlord-scope check per entity. Fails closed — a tenant with no active
  // tenancy under this landlord, a property with a different landlord_id, a
  // unit whose property has a different landlord, or a landlord that isn't the
  // active one — none pass.
  const scopeSql = entity === "tenant"
    ? `SELECT 1 FROM tenancies ten JOIN units u ON u.id = ten.unit_id JOIN properties pr ON pr.id = u.property_id
       WHERE ten.tenant_id = $1 AND pr.landlord_id = $2 LIMIT 1`
    : entity === "property"
    ? `SELECT 1 FROM properties WHERE id = $1 AND landlord_id = $2 LIMIT 1`
    : entity === "unit"
    ? `SELECT 1 FROM units u JOIN properties pr ON pr.id = u.property_id WHERE u.id = $1 AND pr.landlord_id = $2 LIMIT 1`
    : `SELECT 1 FROM landlords WHERE id = $1 AND id = $2 LIMIT 1`;
  const r2 = await db().query(scopeSql, [id, activeLord]);
  return (r2.rowCount ?? 0) > 0;
}

/**
 * Does this blob row (document_blobs.id) belong to an entity that falls under
 * the actor's active landlord? The blob routes don't carry entity in the URL,
 * so we walk the metadata tables (entity_media / tenant_documents /
 * property_documents / landlord_documents) looking for any reference whose
 * entity sits in-scope. True in All-landlords mode (nothing to restrict).
 */
export async function blobInLandlordScope(blobId: string, auth: ApiAuth): Promise<boolean> {
  const activeLord = activeLandlordId(auth);
  if (!activeLord) return true;
  const r = await db().query<{ n: string }>(
    `SELECT 1 AS n WHERE EXISTS (
       -- Via entity_media (property/unit photos)
       SELECT 1 FROM entity_media m
       LEFT JOIN properties p1 ON m.entity_type = 'property' AND p1.id = m.entity_id
       LEFT JOIN units u ON m.entity_type = 'unit' AND u.id = m.entity_id
       LEFT JOIN properties p2 ON p2.id = u.property_id
       WHERE m.blob_id = $1 AND COALESCE(p1.landlord_id, p2.landlord_id) = $2
     ) OR EXISTS (
       -- Via tenant_documents → tenancies → properties
       SELECT 1 FROM tenant_documents d
       JOIN tenancies ten ON ten.tenant_id = d.tenant_id
       JOIN units u ON u.id = ten.unit_id
       JOIN properties pr ON pr.id = u.property_id
       WHERE d.blob_id = $1 AND pr.landlord_id = $2
     ) OR EXISTS (
       -- Via property_documents → properties
       SELECT 1 FROM property_documents d
       JOIN properties pr ON pr.id = d.property_id
       WHERE d.blob_id = $1 AND pr.landlord_id = $2
     ) OR EXISTS (
       -- Via landlord_documents → directly on the landlord
       SELECT 1 FROM landlord_documents d
       WHERE d.blob_id = $1 AND d.landlord_id = $2
     )`,
    [blobId, activeLord]);
  return (r.rowCount ?? 0) > 0;
}

export function isUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
