import { z } from "zod";

// Missing Person Form Schema
export const MissingPersonSchema = z.object({
  full_name: z.string().optional(),
  address: z.string().optional(),
  mobile_number: z.string().optional(),
  dob: z.string().optional(),
  nino: z.string().optional(),
  
  employment_details: z.string().optional(),
  
  height: z.string().optional(),
  shoe_size: z.string().optional(),
  clothing_size: z.string().optional(),
  build: z.string().optional(), // small, medium, large
  distinguishing_marks: z.string().optional(),
  
  ethnicity: z.string().optional(),
  skin_tone: z.string().optional(),
  hair_color: z.string().optional(),
  eye_color: z.string().optional(),
  
  vehicle_details: z.string().optional(),
  potential_risk: z.string().optional(),
  
  next_of_kin_name: z.string().optional(),
  next_of_kin_address: z.string().optional(),
  next_of_kin_contact: z.string().optional(),
  next_of_kin_relationship: z.string().optional(),
  
  other_contacts: z.string().optional(),
  likely_destinations: z.string().optional(),
  
  signed_by: z.string().optional(),
  signed_date: z.string().optional(),
});

// Consents & Agreements
export const ConsentsSchema = z.object({
  data_protection_signed_by: z.string().optional(),
  data_protection_date: z.string().optional(),
  
  fire_evacuation_signed_by: z.string().optional(),
  fire_evacuation_staff_signed_by: z.string().optional(),
  fire_evacuation_date: z.string().optional(),
  
  bcc_housing_benefit_consent_signed_by: z.string().optional(),
  bcc_housing_benefit_consent_date: z.string().optional(),
  
  service_charge_amount: z.string().optional(),
  service_charge_agreement_signed_by: z.string().optional(),
  service_charge_agreement_date: z.string().optional(),
  
  support_agreement_tenant_signed_by: z.string().optional(),
  support_agreement_staff_signed_by: z.string().optional(),
  support_agreement_date: z.string().optional(),
});

// Referral & Initial Assessment
export const ReferralAssessmentSchema = z.object({
  date_of_assessment: z.string().optional(),
  assessor_name: z.string().optional(),
  preferred_area: z.string().optional(),
  telephone_number: z.string().optional(),
  organization: z.string().optional(),
  
  // Demographics
  title: z.string().optional(),
  surname: z.string().optional(),
  first_name: z.string().optional(),
  other_names: z.string().optional(),
  dob: z.string().optional(),
  place_of_birth: z.string().optional(),
  previous_address: z.string().optional(),
  postcode: z.string().optional(),
  home_no: z.string().optional(),
  mobile_no: z.string().optional(),
  work_no: z.string().optional(),
  nino: z.string().optional(),
  gender: z.string().optional(),
  marital_status: z.string().optional(),
  reason_for_homelessness: z.string().optional(),
  
  // Diversity
  ethnicity: z.string().optional(),
  religion: z.string().optional(),
  sexual_orientation: z.string().optional(),
  communication_needs: z.array(z.string()).default([]),
  communication_needs_details: z.string().optional(),
  
  // Financial
  income_sources: z.string().optional(),
  benefits: z.string().optional(),
  total_amount_received: z.string().optional(),
  income_frequency: z.string().optional(),
  debts: z.string().optional(),
  gambling_issues: z.string().optional(),
  
  // Criminal
  criminal_record: z.string().optional(),
  offence_nature: z.string().optional(),
  offence_date: z.string().optional(),
  offence_sentence: z.string().optional(),
  
  // Support Needs (At least 5)
  support_needs: z.array(z.string()).default([]),
  
  // Stage 1 Declaration
  stage1_signed_by: z.string().optional(),
  stage1_date: z.string().optional(),
  
  // Office Use
  referral_received_date: z.string().optional(),
  referred_from: z.string().optional(),
  criteria_met: z.boolean().default(false),
  placement_awarded: z.boolean().default(false),
  reason_not_awarded: z.string().optional(),
  
  // Stage 2
  social_worker: z.string().optional(),
  cpn: z.string().optional(),
  probation_officer: z.string().optional(),
  psychiatrist: z.string().optional(),
  agency_contact_details: z.string().optional(),
  
  registered_gp: z.string().optional(),
  physical_health: z.string().optional(),
  mental_health: z.string().optional(),
  medication: z.string().optional(),
  self_harm_history: z.string().optional(),
  
  uses_drugs: z.boolean().default(false),
  drug_types: z.string().optional(),
  drug_administration: z.string().optional(),
  drug_worker_details: z.string().optional(),
  
  uses_alcohol: z.boolean().default(false),
  alcohol_frequency: z.string().optional(),
  alcohol_issue: z.boolean().default(false),
  alcohol_worker_details: z.string().optional(),
});

// The Overall Pack Tracker
export const ReliancePackTrackerSchema = z.object({
  housing_benefit_claim_date: z.string().optional(),
  housing_benefit_reference: z.string().optional(), // Extremely important for revenue
  
  personal_details_date: z.string().optional(),
  missing_person_date: z.string().optional(),
  initial_assessment_date: z.string().optional(),
  service_charge_date: z.string().optional(),
  confidentiality_date: z.string().optional(),
  risk_support_plan_date: z.string().optional(),
});

// The Complete Reliance Pack Schema
export const ReliancePackSchema = z.object({
  tracker: ReliancePackTrackerSchema.default({}),
  missing_person: MissingPersonSchema.default({}),
  consents: ConsentsSchema.default({}),
  referral: ReferralAssessmentSchema.default({}),
});

export type ReliancePack = z.infer<typeof ReliancePackSchema>;
export type MissingPerson = z.infer<typeof MissingPersonSchema>;
export type RelianceConsents = z.infer<typeof ConsentsSchema>;
export type ReferralAssessment = z.infer<typeof ReferralAssessmentSchema>;
export type ReliancePackTracker = z.infer<typeof ReliancePackTrackerSchema>;
