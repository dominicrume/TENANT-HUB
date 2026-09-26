/**
 * Money and arrears schemas (supabase/migrations/034): the FIFO arrears view,
 * the weak-match queue, the ladder's cases and events, and drafted documents.
 */
import { z } from "zod";
import { UkDateSchema, MoneyGbpSchema } from "./primitives";

export const TenancyArrearsSchema = z.object({
  tenant_id: z.string().uuid(),
  org_id: z.string().uuid().nullable(),
  tenancy_id: z.string().uuid().nullable(),
  /** Charged minus paid. Positive = owed. */
  balance: MoneyGbpSchema.or(z.number()),
  /** Oldest past-due charge not covered by cumulative payments. */
  oldest_unpaid: UkDateSchema.nullable(),
});

export const UnmatchedStatusSchema = z.enum(["pending", "confirmed", "dismissed"]);
export const RentUnmatchedSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  tenant_id: z.string().uuid().nullable().optional(),
  amount: MoneyGbpSchema,
  received_on: UkDateSchema,
  external_reference: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  source_adapter: z.string().min(1),
  is_simulated: z.boolean(),
  status: UnmatchedStatusSchema.default("pending"),
  resolved_by: z.string().uuid().nullable().optional(),
  resolved_at: z.string().datetime({ offset: true }).nullable().optional(),
  created_at: z.string().datetime({ offset: true }).optional(),
});
/** "Yes, it's rent" / "Not rent". */
export const RentUnmatchedResolveSchema = z.object({ action: z.enum(["confirm", "dismiss"]), tenant_id: z.string().uuid().optional() });

export const ArrearsCaseSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  tenancy_id: z.string().uuid().nullable().optional(),
  opened_on: UkDateSchema,
  stage: z.string().min(1),
  balance_at_open: MoneyGbpSchema.nullable().optional(),
  closed_on: UkDateSchema.nullable().optional(),
  created_at: z.string().datetime({ offset: true }).optional(),
});

export const ArrearsEventSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  case_id: z.string().uuid(),
  stage: z.string().min(1),
  action: z.string().min(1),
  generated_document_id: z.string().uuid().nullable().optional(),
  requires_approval: z.boolean().default(true),
  approved_by: z.string().uuid().nullable().optional(),
  approved_at: z.string().datetime({ offset: true }).nullable().optional(),
  released_at: z.string().datetime({ offset: true }).nullable().optional(),
  created_at: z.string().datetime({ offset: true }).optional(),
});

export const DocumentSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  kind: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
  related_table: z.string().nullable().optional(),
  related_id: z.string().uuid().nullable().optional(),
  tenant_id: z.string().uuid().nullable().optional(),
  is_simulated: z.boolean().default(true),
  created_at: z.string().datetime({ offset: true }).optional(),
});

export type TenancyArrears = z.infer<typeof TenancyArrearsSchema>;
export type RentUnmatched = z.infer<typeof RentUnmatchedSchema>;
export type ArrearsCase = z.infer<typeof ArrearsCaseSchema>;
export type ArrearsEvent = z.infer<typeof ArrearsEventSchema>;
export type DraftedDocument = z.infer<typeof DocumentSchema>;
