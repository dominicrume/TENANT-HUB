/**
 * Service charge schemas — canonical shapes for the weekly charge ledger.
 * Mirrors the `service_charges` table.
 */
import { z } from "zod";
import { UkDateSchema, MoneyGbpSchema } from "./primitives";

export const ServiceChargeSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  week_label: z.string().min(1),
  due_date: UkDateSchema,
  amount: MoneyGbpSchema,
  is_paid: z.boolean().default(false),
  paid_date: UkDateSchema.optional().nullable(),
  entered_by: z.string().uuid().optional(),
  created_at: z.string().datetime().optional(),
});

export const ServiceChargeCreateSchema = ServiceChargeSchema.omit({
  id: true,
  entered_by: true,
  created_at: true,
});

export const ServiceChargePatchSchema = ServiceChargeSchema.partial().required({ id: true });

export type ServiceCharge = z.infer<typeof ServiceChargeSchema>;
export type ServiceChargeCreate = z.infer<typeof ServiceChargeCreateSchema>;
export type ServiceChargePatch = z.infer<typeof ServiceChargePatchSchema>;
