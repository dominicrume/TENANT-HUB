/**
 * Accommodation projection (H3: derive-only).
 *
 * Where a tenant lives is a fact about their active tenancy, not about the
 * person. The tenants row keeps address / postcode / room_number as a
 * convenience for old forms; this function derives them from the spine so
 * they are never written from two places. Repositories call it when they load
 * a tenant with an active tenancy; if there is none, the stored columns stand.
 */
import type { CanonicalTenant, Property, Tenancy, Unit } from "@tenant-hub/validation";

export interface Accommodation {
  property: Pick<Property, "id" | "name" | "address_line1" | "postcode" | "asset_class">;
  unit: Pick<Unit, "id" | "reference" | "unit_class">;
  tenancy: Pick<Tenancy, "id" | "start_date" | "rent_amount" | "rent_frequency" | "status">;
}

/** A tenant with accommodation fields derived from the active tenancy. Readonly. */
export function withAccommodation<T extends Pick<CanonicalTenant, "address" | "postcode" | "room_number" | "moved_in">>(tenant: T, acc: Accommodation | null): Readonly<T & { accommodation: Accommodation | null }> {
  if (!acc || acc.tenancy.status !== "active") return Object.freeze({ ...tenant, accommodation: acc });
  return Object.freeze({
    ...tenant,
    address: acc.property.address_line1 ?? tenant.address,
    postcode: acc.property.postcode ?? tenant.postcode,
    room_number: acc.unit.reference,
    moved_in: acc.tenancy.start_date ?? tenant.moved_in,
    accommodation: acc,
  });
}

/** The fields the spine now owns. Writing them on the tenant directly is a projection write (H3) and is refused by the repository. */
export const SPINE_OWNED_TENANT_FIELDS = ["address", "postcode", "room_number"] as const;

/** Strip spine-owned fields from a tenant patch when the tenant has an active tenancy. */
export function stripSpineOwnedFields<P extends Record<string, unknown>>(patch: P, hasActiveTenancy: boolean): { patch: P; stripped: string[] } {
  if (!hasActiveTenancy) return { patch, stripped: [] };
  const out = { ...patch }; const stripped: string[] = [];
  for (const k of SPINE_OWNED_TENANT_FIELDS) if (k in out) { delete (out as Record<string, unknown>)[k]; stripped.push(k); }
  return { patch: out, stripped };
}
