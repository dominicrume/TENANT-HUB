import { z } from "zod";

export const Form53Schema = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid(),
  created_at: z.string().optional(),
  
  // Comfort and Behaviour (1-5)
  comfort_communal: z.number().min(1).max(5),
  internal_disputes: z.number().min(1).max(5),
  antisocial_behaviour: z.number().min(1).max(5),
  cordial_relations: z.number().min(1).max(5),
  
  // Signposting (1-5)
  cultural_activities: z.number().min(1).max(5),
  employment_courses: z.number().min(1).max(5),
  counselling_services: z.number().min(1).max(5),
  local_amenities: z.number().min(1).max(5),
  food_banks: z.number().min(1).max(5),
  voluntary_work: z.number().min(1).max(5),
  
  // Repairs and Maintenance (1-5)
  reporting_procedure: z.number().min(1).max(5),
  property_condition: z.number().min(1).max(5),
  repair_time: z.number().min(1).max(5),
  notification_time: z.number().min(1).max(5),
  appliance_condition: z.number().min(1).max(5),
  
  // Checkbox groups (activities participated in)
  social_activities: z.array(z.string()).default([]),
  life_skills_activities: z.array(z.string()).default([]),
  health_wellbeing_activities: z.array(z.string()).default([]),
});

export type Form53 = z.infer<typeof Form53Schema>;
