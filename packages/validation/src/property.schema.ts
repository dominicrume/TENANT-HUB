/**
 * Property spine schemas — homes → rooms → tenancies (supabase/migrations/033).
 * Asset class selects the rule set in code (H13). z.infer is the only type source.
 */
import { z } from "zod";
import { UkDateSchema, UkPostcodeSchema, MoneyGbpSchema } from "./primitives";

export const AssetClassSchema = z.enum(["supported", "residential", "commercial", "mixed"]);
export const UnitClassSchema = z.enum(["supported", "residential", "commercial"]);
export const UnitStatusSchema = z.enum(["occupied", "vacant", "refurbishment", "held"]);
export const TenancyTypeSchema = z.enum(["supported_licence", "licence", "ast", "commercial_lease", "company_let"]);
export const RentFrequencySchema = z.enum(["weekly", "fortnightly", "four_weekly", "monthly", "quarterly"]);
export const TenancyStatusSchema = z.enum(["draft", "active", "ending", "ended"]);

export const PropertySchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  address_line1: z.string().max(200).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  postcode: UkPostcodeSchema.nullable().optional(),
  asset_class: AssetClassSchema.default("supported"),
  floors: z.number().int().nonnegative().nullable().optional(),
  rebuild_value: MoneyGbpSchema.nullable().optional(),
  acquired_on: UkDateSchema.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  created_at: z.string().datetime({ offset: true }).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
});
/** Add a home: three fields, plus the type. */
export const PropertyCreateSchema = PropertySchema.pick({ name: true, address_line1: true, postcode: true, asset_class: true, city: true });

export const UnitSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  property_id: z.string().uuid(),
  reference: z.string().min(1).max(40),
  unit_class: UnitClassSchema.default("supported"),
  floor: z.number().int().nullable().optional(),
  bedrooms: z.number().int().nonnegative().nullable().optional(),
  status: UnitStatusSchema.default("vacant"),
  created_at: z.string().datetime({ offset: true }).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
});
export const UnitCreateSchema = UnitSchema.pick({ property_id: true, reference: true, unit_class: true });

export const TenancySchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  unit_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  tenancy_type: TenancyTypeSchema.default("supported_licence"),
  start_date: UkDateSchema.nullable().optional(),
  end_date: UkDateSchema.nullable().optional(),
  rent_amount: MoneyGbpSchema.default(0),
  rent_frequency: RentFrequencySchema.default("weekly"),
  rent_due_day: z.number().int().min(1).max(31).nullable().optional(),
  status: TenancyStatusSchema.default("active"),
  created_at: z.string().datetime({ offset: true }).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
});
export const TenancyCreateSchema = TenancySchema.pick({ unit_id: true, tenant_id: true, start_date: true, rent_amount: true, rent_frequency: true, tenancy_type: true });

export type AssetClass = z.infer<typeof AssetClassSchema>;
export type UnitClass = z.infer<typeof UnitClassSchema>;
export type Property = z.infer<typeof PropertySchema>;
export type PropertyCreate = z.infer<typeof PropertyCreateSchema>;
export type Unit = z.infer<typeof UnitSchema>;
export type UnitCreate = z.infer<typeof UnitCreateSchema>;
export type Tenancy = z.infer<typeof TenancySchema>;
export type TenancyCreate = z.infer<typeof TenancyCreateSchema>;
