import { z } from "zod";

export const SettingsUpdateSchema = z.object({
  id: z.string().uuid(),
  service_charge_default: z.number().min(0, "Service charge must be a positive number"),
});

export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>;
