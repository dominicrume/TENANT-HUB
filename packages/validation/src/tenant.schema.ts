/**
 * CanonicalTenantSchema — the single source of truth for a tenant record.
 * ALL forms derive from this. No hand-typed duplicate interfaces.
 * z.infer<typeof CanonicalTenantSchema> is the ONLY Tenant type.
 */
import { z } from "zod";
import { NinoSchema, UkPhoneSchema, UkDateSchema, UkPostcodeSchema, MoneyGbpSchema } from "./primitives";

export const TitleSchema = z.enum(["Mr", "Mrs", "Ms", "Miss", "Dr"]);
export const BenefitTypeSchema = z.enum(["Universal Credit", "Housing Benefit", "PIP", "ESA", "JSA", "Other"]);
export const BenefitFrequencySchema = z.enum(["Monthly", "Fortnightly", "Weekly"]);
export const BrandSchema = z.enum(["mattys_place", "ash_shahada", "reliance"]);
export const EntryMethodSchema = z.enum(["manual", "ocr", "voice"]);
export const UserRoleSchema = z.enum(["manager", "support_worker", "tenant"]);

export const CanonicalTenantSchema = z.object({
  id:              z.string().uuid(),

  // Personal
  title:           TitleSchema,
  full_name:       z.string().min(2).max(100),
  dob:             UkDateSchema,
  nino:            NinoSchema,
  nationality:     z.string().min(2).max(60),
  date_entry_uk:   UkDateSchema.optional(),

  // Accommodation
  address:         z.string().min(5).max(200),
  postcode:        UkPostcodeSchema,
  room_number:     z.string().regex(/^Room\s\d+$/i, "Format: Room N"),
  moved_in:        UkDateSchema,
  mobile:          UkPhoneSchema,
  email:           z.string().email().optional(),
  languages:       z.string().optional(),

  // Financial
  benefit_type:    BenefitTypeSchema,
  benefit_frequency: BenefitFrequencySchema,
  benefit_amount:  MoneyGbpSchema,

  // Next of kin
  nok_name:        z.string().min(2).max(100),
  nok_relationship: z.string().min(2).max(50),
  nok_phone:       UkPhoneSchema,
  nok_address:     z.string().optional(),

  // Professional
  doctor:          z.string().optional(),
  probation_officer: z.string().optional(),

  // System
  brand:           BrandSchema,
  entry_method:    EntryMethodSchema,
  photo_url:       z.string().url().optional(),
  is_active:       z.boolean().default(true),
  is_archived:     z.boolean().default(false),

  // Audit (set by DB / writeWithAudit — not form input)
  blockchain_hash:        z.string().optional(),
  tenant_signature_hash:  z.string().optional(),
  created_by:      z.string().uuid().optional(),
  created_at:      z.string().datetime().optional(),
  updated_at:      z.string().datetime().optional(),
});

// Patch type for updates — all fields optional except id
export const TenantPatchSchema = CanonicalTenantSchema
  .partial()
  .required({ id: true });

// Create type — no id/audit fields
export const TenantCreateSchema = CanonicalTenantSchema
  .omit({ id: true, blockchain_hash: true, tenant_signature_hash: true,
          created_by: true, created_at: true, updated_at: true });

export type CanonicalTenant = z.infer<typeof CanonicalTenantSchema>;
export type TenantPatch     = z.infer<typeof TenantPatchSchema>;
export type TenantCreate    = z.infer<typeof TenantCreateSchema>;
