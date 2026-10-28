/**
 * CanonicalTenantSchema — the single source of truth for a tenant record.
 * ALL forms derive from this. No hand-typed duplicate interfaces.
 * z.infer<typeof CanonicalTenantSchema> is the ONLY Tenant type.
 */
import { z } from "zod";
import { NinoSchema, UkPhoneSchema, UkDateSchema, UkPostcodeSchema, MoneyGbpSchema } from "./primitives";

const preprocessEnum = (validValues: string[]) => z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const normalized = v.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const match = validValues.find(val => val.toLowerCase().replace(/[^a-z0-9]/g, "") === normalized);
  return match ?? v;
}, z.enum(validValues as [string, ...string[]]));

export const TITLES = ["Mr", "Mrs", "Ms", "Miss", "Dr"] as const;
export const BENEFIT_TYPES = ["Universal Credit", "Housing Benefit", "PIP", "ESA", "JSA", "Other"] as const;
export const BENEFIT_FREQUENCIES = ["Monthly", "Fortnightly", "Weekly"] as const;

export const TitleSchema = preprocessEnum([...TITLES]);
export const BenefitTypeSchema = preprocessEnum([...BENEFIT_TYPES]);
export const BenefitFrequencySchema = preprocessEnum([...BENEFIT_FREQUENCIES]);
export const BrandSchema = preprocessEnum(["mattys_place", "reliance"]);
export const EntryMethodSchema = z.enum(["manual", "ocr", "voice"]);
export const UserRoleSchema = z.enum(["admin", "manager", "support_worker", "tenant", "contractor"]);

export const CanonicalTenantSchema = z.object({
  id:              z.string().uuid(),

  // Personal
  title:           TitleSchema,
  full_name:       z.string().min(2).max(100),
  dob:             UkDateSchema,
  nino:            NinoSchema,
  nationality:     z.string().min(2).max(60),
  // Every optional field below also accepts `null`. The tenant edit form
  // sends `null` to CLEAR a value (an empty string becomes null in the PATCH
  // body) — plain `.optional()` only allows `undefined`, which was causing
  // every cleared field to fail with "Expected string, received null" and
  // name the field in the save banner. .nullable().optional() = cleared OK.
  date_entry_uk:   UkDateSchema.nullable().optional(),

  // Accommodation
  address:         z.string().min(5).max(200),
  postcode:        UkPostcodeSchema,
  room_number:     z.preprocess((v) => (typeof v === "string" && /^\d+$/.test(v.trim()) ? `Room ${v.trim()}` : v), z.string().regex(/^Room\s\d+$/i, "Format: Room N")),
  moved_in:        UkDateSchema,
  mobile:          UkPhoneSchema,
  email:           z.string().email().nullable().optional(),
  languages:       z.string().nullable().optional(),

  // Financial
  benefit_type:    BenefitTypeSchema,
  benefit_frequency: BenefitFrequencySchema,
  benefit_amount:  MoneyGbpSchema,
  housing_benefit_status: z.enum(["active", "in_progress", "suspended"]).default("in_progress"),
  hb_reference_number: z.string().nullable().optional(),
  hb_claim_date:   UkDateSchema.nullable().optional(),
  // `.url()` would reject empty-cleared values even with .nullable(); the
  // route stores a /api/documents/<id>/file path OR a full URL, so a looser
  // string shape here keeps uploads working without special-casing nulls.
  hb_document_url: z.string().nullable().optional(),

  // Next of kin
  nok_name:        z.string().min(2).max(100),
  nok_relationship: z.string().min(2).max(50),
  nok_phone:       UkPhoneSchema,
  nok_address:     z.string().nullable().optional(),

  // Professional
  doctor:          z.string().nullable().optional(),
  probation_officer: z.string().nullable().optional(),

  // System
  brand:           BrandSchema,
  entry_method:    EntryMethodSchema,
  photo_url:       z.string().url().nullable().optional(),
  is_active:       z.boolean().default(true),
  is_archived:     z.boolean().default(false),

  // Audit (set by DB / writeWithAudit — not form input)
  blockchain_hash:        z.string().nullable().optional(),
  tenant_signature_hash:  z.string().nullable().optional(),
  created_by:      z.string().uuid().nullable().optional(),
  created_at:      z.string().datetime().nullable().optional(),
  updated_at:      z.string().datetime().nullable().optional(),
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
