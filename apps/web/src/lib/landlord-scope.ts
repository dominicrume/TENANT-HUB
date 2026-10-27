/**
 * landlord-scope — the single source for "limit this query to the active landlord".
 *
 * The data model has three nested scopes: Organisation → Landlord → everything else.
 * `org_id` is already enforced everywhere. This file enforces LANDLORD, by returning
 * a reusable WHERE fragment every data route splices into its SQL.
 *
 * Why it exists (2026-10-27, Rume): the top-bar landlord switcher writes
 * `user_sessions.active_landlord_id` and is read back by the picker, but ZERO data
 * routes filtered on it — switching between OKE_DOM and other landlords left every
 * list on every page unchanged. The switcher was cosmetic. This closes the leak at
 * one layer: the handler.
 *
 * Rule of thumb for callers:
 *   const scope = landlordScope(auth, "viaProperty", { col: "d.property_id", paramIndex: 2 });
 *   db().query(`SELECT ... FROM diary_entries d
 *               WHERE d.org_id = $1 ${scope.sql}`,
 *              [auth.actor.org_id, ...scope.params]);
 *
 * In "All landlords" mode (actor.landlord_id === null) scope.sql is "" and scope.params
 * is []. Nothing changes — the splice is a no-op.
 */
import type { Actor } from "./api-auth";

export type LandlordScopeMode =
  /** Table has a `landlord_id` column of its own (properties, leads, landlord_documents). */
  | "direct"
  /** Table has a `property_id` column — scope through properties.landlord_id
   *  (units, certificates, maintenance_tickets, diary_entries, property_documents, …). */
  | "viaProperty"
  /** Table has a `unit_id` column — scope through units.property_id → properties.landlord_id
   *  (tenancies). */
  | "viaUnit"
  /** Table has a `tenant_id` column but no property_id — scope through
   *  tenancies → units → properties.landlord_id (tenant_documents, sessions,
   *  rent_payments, service_charges, commitments, communications, …). */
  | "viaTenant"
  /** Table has a `tenancy_id` column — scope through tenancies → units → properties.landlord_id
   *  (rent_unmatched link rows, tenancy_arrears, …). */
  | "viaTenancy"
  /** The `tenants` table itself — scope its own PK via tenancies → units → properties.landlord_id. */
  | "tenantsTable";

export interface LandlordScopeResult {
  /** Fragment to splice into the WHERE clause. Empty string in All-landlords mode. */
  sql: string;
  /** Parameters to append to the query args. Empty array in All-landlords mode. */
  params: string[];
}

/** The active landlord id, or null when the user is viewing "all landlords". */
export function activeLandlordId(auth: { actor: Actor }): string | null {
  return auth.actor.landlord_id ?? null;
}

/** Does the actor have the authority to break out of their active landlord scope
 *  (e.g. a platform owner looking at everything)? Reserved — today, nobody does. */
export function canBypassLandlordScope(_auth: { actor: Actor }): boolean {
  return false;
}

/**
 * Build a WHERE fragment that limits rows to the actor's active landlord.
 * Returns `{ sql: "", params: [] }` when the user is in "All landlords" mode —
 * callers can splice it unconditionally and get the right behaviour.
 *
 * `col` is the column on the table being filtered (defaults suit the common case).
 * `paramIndex` is the pg placeholder number (`$2`, `$3`, …) the landlord id will land at.
 */
export function landlordScope(
  auth: { actor: Actor },
  mode: LandlordScopeMode,
  opts: { col?: string; paramIndex: number },
): LandlordScopeResult {
  const id = activeLandlordId(auth);
  if (!id) return { sql: "", params: [] };
  const p = `$${opts.paramIndex}`;
  const col = opts.col ?? defaultColFor(mode);
  switch (mode) {
    case "direct":
      return { sql: ` AND ${col} = ${p}`, params: [id] };
    case "viaProperty":
      return {
        sql: ` AND ${col} IN (SELECT id FROM properties WHERE landlord_id = ${p})`,
        params: [id],
      };
    case "viaUnit":
      return {
        sql: ` AND ${col} IN (
          SELECT u.id FROM units u
          JOIN properties pr ON pr.id = u.property_id
          WHERE pr.landlord_id = ${p}
        )`,
        params: [id],
      };
    case "viaTenant":
    case "tenantsTable":
      return {
        sql: ` AND ${col} IN (
          SELECT DISTINCT ten.tenant_id FROM tenancies ten
          JOIN units u ON u.id = ten.unit_id
          JOIN properties pr ON pr.id = u.property_id
          WHERE pr.landlord_id = ${p}
        )`,
        params: [id],
      };
    case "viaTenancy":
      return {
        sql: ` AND ${col} IN (
          SELECT ty.id FROM tenancies ty
          JOIN units u ON u.id = ty.unit_id
          JOIN properties pr ON pr.id = u.property_id
          WHERE pr.landlord_id = ${p}
        )`,
        params: [id],
      };
  }
}

function defaultColFor(mode: LandlordScopeMode): string {
  switch (mode) {
    case "direct": return "landlord_id";
    case "viaProperty": return "property_id";
    case "viaUnit": return "unit_id";
    case "viaTenant": return "tenant_id";
    case "tenantsTable": return "id";
    case "viaTenancy": return "tenancy_id";
  }
}

/**
 * Write-side guard: before inserting a row that will carry a landlord_id, assert
 * that the caller isn't about to pin a scoped user's new row onto a DIFFERENT
 * landlord than the one they're actively scoped to.
 *
 * Returns null when it's fine (null bodyLandlordId means "default from session";
 * matching ids means "obvious ok"; All-landlords actor means "no scope to break").
 * Returns a string error message when it isn't — pass that back as a 403.
 */
export function assertLandlordWriteAllowed(
  auth: { actor: Actor },
  bodyLandlordId: string | null | undefined,
): string | null {
  const active = activeLandlordId(auth);
  if (!active) return null; // All-landlords actor: free to target any landlord
  if (!bodyLandlordId) return null; // body omitted → we'll default to the active one
  if (bodyLandlordId === active) return null;
  return "You're scoped to one landlord — switch to All landlords to create under a different one.";
}

/**
 * Pick the landlord_id the new row should carry: whatever the body explicitly set,
 * else default to the actor's active landlord, else null (All landlords mode and
 * body didn't specify — the row lands unassigned, same as before this change).
 */
export function resolveLandlordForWrite(
  auth: { actor: Actor },
  bodyLandlordId: string | null | undefined,
): string | null {
  if (bodyLandlordId) return bodyLandlordId;
  return activeLandlordId(auth);
}

/**
 * One-shot guard for routes that act on a specific tenant/property/landlord by URL
 * path (/tenants/[id], /properties/[id], etc.) and don't already query the parent
 * row. Returns true when the subject is reachable under the actor's active landlord
 * scope (or when the actor is in All landlords mode). Caller: `if (!ok) return 404`.
 *
 * We 404 (not 403) deliberately: URL-poking from another landlord's session must
 * not tell them the id exists in some other landlord's portfolio.
 */
export async function isTenantInScope(
  queryFn: (sql: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>,
  auth: { actor: Actor },
  tenantId: string,
): Promise<boolean> {
  const active = activeLandlordId(auth);
  if (!active) return true;
  const r = await queryFn(
    `SELECT 1 FROM tenancies ten
     JOIN units u ON u.id = ten.unit_id
     JOIN properties pr ON pr.id = u.property_id
     WHERE ten.tenant_id = $1 AND pr.landlord_id = $2 LIMIT 1`,
    [tenantId, active],
  );
  return r.rows.length > 0;
}

export async function isPropertyInScope(
  queryFn: (sql: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>,
  auth: { actor: Actor },
  propertyId: string,
): Promise<boolean> {
  const active = activeLandlordId(auth);
  if (!active) return true;
  const r = await queryFn(
    `SELECT 1 FROM properties WHERE id = $1 AND landlord_id = $2 LIMIT 1`,
    [propertyId, active],
  );
  return r.rows.length > 0;
}
