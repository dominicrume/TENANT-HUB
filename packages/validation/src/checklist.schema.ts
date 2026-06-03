/**
 * Intake checklist schema — mirrors the `intake_checklists` table.
 * Boolean item per onboarding task across On Arrival / Within 3 Days / After.
 */
import { z } from "zod";

export const CHECKLIST_ITEMS = [
  "housing_benefit_claim",
  "personal_details_form",
  "missing_person_form",
  "initial_assessment",
  "service_charge_agreement",
  "confidentiality_form",
  "risk_assessment",
  "gp_registered",
  "uc_claim_progressed",
  "key_worker_assigned",
] as const;

export type ChecklistItem = (typeof CHECKLIST_ITEMS)[number];

const itemShape = Object.fromEntries(
  CHECKLIST_ITEMS.map((k) => [k, z.boolean().default(false)]),
) as Record<ChecklistItem, z.ZodDefault<z.ZodBoolean>>;

export const IntakeChecklistSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  ...itemShape,
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export const IntakeChecklistPatchSchema = IntakeChecklistSchema.partial().required({ id: true });

export type IntakeChecklist = z.infer<typeof IntakeChecklistSchema>;
export type IntakeChecklistPatch = z.infer<typeof IntakeChecklistPatchSchema>;
