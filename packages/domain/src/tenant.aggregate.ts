/**
 * Tenant Aggregate — the SINGLE write entry for all tenant data.
 * mutate(patch) is the one and only way to change a tenant.
 * ProjectionRegistry derives readonly views. Never persisted directly.
 */
import { z } from "zod";
import {
  CanonicalTenantSchema, TenantPatch,
  type CanonicalTenant
} from "@tenant-hub/validation";

// ── Projections (READ-ONLY derived views) ────────────────────────────────

export const PersonalDetailsProjection = CanonicalTenantSchema
  .pick({ id:true, title:true, full_name:true, dob:true, nino:true,
          nationality:true, date_entry_uk:true, mobile:true, email:true,
          languages:true, address:true, postcode:true, room_number:true })
  .readonly();

export const CouncilSupportPlanHeaderProjection = CanonicalTenantSchema
  .pick({ id:true, full_name:true, room_number:true, moved_in:true,
          benefit_type:true, benefit_amount:true, brand:true })
  .readonly();

export const IntakeChecklistProjection = CanonicalTenantSchema
  .pick({ id:true, full_name:true, room_number:true, nino:true,
          benefit_type:true, moved_in:true })
  .readonly();

// ── Field map: projection field → canonical field ────────────────────────
// A projected field NOT in this map is a lint/type error (enforced by readonly)
export const fieldMap = {
  PersonalDetails: PersonalDetailsProjection.unwrap().shape,
  CouncilSupportPlanHeader: CouncilSupportPlanHeaderProjection.unwrap().shape,
  IntakeChecklist: IntakeChecklistProjection.unwrap().shape,
} as const;

// ── Projection Registry ───────────────────────────────────────────────────
export const ProjectionRegistry = {
  reproject(tenant: CanonicalTenant) {
    return {
      personalDetails:         PersonalDetailsProjection.parse(tenant),
      councilSupportPlanHeader: CouncilSupportPlanHeaderProjection.parse(tenant),
      intakeChecklist:         IntakeChecklistProjection.parse(tenant),
    };
  },
};

// ── Tenant Aggregate ─────────────────────────────────────────────────────
export class TenantAggregate {
  private _state: CanonicalTenant;

  constructor(state: CanonicalTenant) {
    this._state = CanonicalTenantSchema.parse(state);
  }

  /** THE single write entry. Returns new immutable instance. */
  mutate(patch: Omit<TenantPatch, "id">): TenantAggregate {
    const next = CanonicalTenantSchema.parse({ ...this._state, ...patch });
    return new TenantAggregate(next);
  }

  get state(): Readonly<CanonicalTenant> {
    return Object.freeze({ ...this._state });
  }

  projections() {
    return ProjectionRegistry.reproject(this._state);
  }
}
