import { z } from "zod";

export const RentPaymentCreateSchema = z.object({
  tenant_id: z.string().uuid(),
  amount: z.number().positive(),
  payment_type: z.string().min(1),
  payment_date: z.string(), // ISO date
  reference_note: z.string().optional(),
});

export type RentPaymentCreate = z.infer<typeof RentPaymentCreateSchema>;
