/**
 * Operations schemas (supabase/migrations/035–037): certificates and alerts,
 * insurance, regulation, repairs triage, trades and dispatch, commitments.
 */
import { z } from "zod";
import { UkDateSchema, MoneyGbpSchema } from "./primitives";
import { UnitClassSchema } from "./property.schema";

/* ── Certificates ──────────────────────────────────────────────────────── */
export const CertificateTypeSchema = z.object({
  id: z.string().uuid(), name: z.string().min(1), default_validity_months: z.number().int().positive(),
  applies_to: UnitClassSchema, statutory_reference: z.string().nullable().optional(),
});
export const CertificateSchema = z.object({
  id: z.string().uuid(), org_id: z.string().uuid(), property_id: z.string().uuid(), unit_id: z.string().uuid().nullable().optional(),
  certificate_type_id: z.string().uuid(), issued_on: UkDateSchema.nullable().optional(), expires_on: UkDateSchema.nullable().optional(),
  document_url: z.string().url().nullable().optional(), created_by: z.string().uuid().nullable().optional(), created_at: z.string().datetime({ offset: true }).optional(),
});
/** Add a certificate: the type is pre-chosen by the cell; two dates and an optional photo. */
export const CertificateCreateSchema = CertificateSchema.pick({ property_id: true, unit_id: true, certificate_type_id: true, issued_on: true, expires_on: true, document_url: true });
export const AlertKindSchema = z.enum(["expiring_90", "expiring_60", "expiring_30", "expiring_7", "expired", "missing"]);
export const ComplianceAlertSchema = z.object({
  id: z.string().uuid(), org_id: z.string().uuid(), property_id: z.string().uuid(), certificate_name: z.string().min(1), kind: AlertKindSchema,
  expires_on: UkDateSchema.nullable().optional(), raised_at: z.string().datetime({ offset: true }).optional(), resolved_at: z.string().datetime({ offset: true }).nullable().optional(),
});

/* ── Insurance (ends at a decision card, H10) ───────────────────────────── */
export const CycleStatusSchema = z.enum(["detected", "risk_assembled", "quotes_gathered", "awaiting_decision", "decided", "lapsed"]);
export const CycleDecisionSchema = z.enum(["accept", "decline", "defer"]);
export const InsurancePolicySchema = z.object({
  id: z.string().uuid(), org_id: z.string().uuid(), property_id: z.string().uuid(), insurer: z.string().nullable().optional(), policy_reference: z.string().nullable().optional(),
  renewal_date: UkDateSchema.nullable().optional(), annual_premium: MoneyGbpSchema.nullable().optional(), sum_insured: MoneyGbpSchema.nullable().optional(),
  excess: MoneyGbpSchema.nullable().optional(), renewal_lead_days: z.number().int().positive().default(21), created_at: z.string().datetime({ offset: true }).optional(),
});
export const InsurancePolicyCreateSchema = InsurancePolicySchema.pick({ property_id: true, insurer: true, policy_reference: true, renewal_date: true, annual_premium: true, sum_insured: true, excess: true, renewal_lead_days: true });
export const InsuranceRenewalCycleSchema = z.object({
  id: z.string().uuid(), org_id: z.string().uuid(), policy_id: z.string().uuid(), status: CycleStatusSchema.default("detected"),
  prior_premium: MoneyGbpSchema.nullable().optional(), best_quote_id: z.string().uuid().nullable().optional(), decision: CycleDecisionSchema.nullable().optional(),
  decided_by: z.string().uuid().nullable().optional(), decided_at: z.string().datetime({ offset: true }).nullable().optional(), created_at: z.string().datetime({ offset: true }).optional(),
});
export const InsuranceDecisionSchema = z.object({ cycle_id: z.string().uuid(), decision: CycleDecisionSchema, chosen_quote_id: z.string().uuid().optional() });
export const InsuranceQuoteSchema = z.object({
  id: z.string().uuid(), org_id: z.string().uuid(), policy_id: z.string().uuid(), cycle_id: z.string().uuid(), provider_name: z.string().min(1),
  premium: MoneyGbpSchema, excess: MoneyGbpSchema.nullable().optional(), cover_summary: z.record(z.unknown()).nullable().optional(),
  source_adapter: z.string().min(1), is_simulated: z.boolean(), retrieved_at: z.string().datetime({ offset: true }).optional(),
});

/* ── Regulation ────────────────────────────────────────────────────────── */
export const RegScopeSchema = z.enum(["supported", "residential", "commercial", "all", "unknown"]);
export const ImpactStatusSchema = z.enum(["new", "acknowledged", "actioned", "not_applicable"]);
export const RegulationItemSchema = z.object({
  id: z.string().uuid(), org_id: z.string().uuid(), source_id: z.string().uuid().nullable().optional(), external_id: z.string().min(1), title: z.string().nullable().optional(),
  published_on: UkDateSchema.nullable().optional(), url: z.string().nullable().optional(), raw_excerpt: z.string().nullable().optional(), applies_to: RegScopeSchema.default("unknown"),
  category: z.string().nullable().optional(), summary: z.string().nullable().optional(), confidence: z.number().min(0).max(1).nullable().optional(),
  classified_by_model: z.string().nullable().optional(), created_at: z.string().datetime({ offset: true }).optional(),
});
export const RegulationImpactSchema = z.object({
  id: z.string().uuid(), org_id: z.string().uuid(), regulation_item_id: z.string().uuid(), property_id: z.string().uuid(),
  impact_note: z.string().nullable().optional(), status: ImpactStatusSchema.default("new"), created_at: z.string().datetime({ offset: true }).optional(),
});

/* ── Repairs ───────────────────────────────────────────────────────────── */
export const IssueViaSchema = z.enum(["portal", "phone", "voice", "email", "inspection", "qr", "staff"]);
export const IssueSeveritySchema = z.enum(["emergency", "urgent", "routine", "cosmetic"]);
export const TriageResultSchema = z.object({ category: z.string().min(1), severity: IssueSeveritySchema, reasoning: z.string() });
/** The wall QR form: one question, one optional room, one button. */
export const PublicReportSchema = z.object({ property_id: z.string().uuid(), unit_id: z.string().uuid().optional(), raw_report: z.string().min(3).max(2000), reporter: z.string().max(100).optional() });
export const TradeSchema = z.object({
  id: z.string().uuid(), org_id: z.string().uuid(), name: z.string().min(1), category: z.string().min(1), contact_email: z.string().email().nullable().optional(),
  contact_phone: z.string().nullable().optional(), is_emergency_capable: z.boolean().default(false), profile_id: z.string().uuid().nullable().optional(), created_at: z.string().datetime({ offset: true }).optional(),
});
export const TradeCreateSchema = TradeSchema.pick({ name: true, category: true, contact_email: true, contact_phone: true, is_emergency_capable: true });
export const DispatchJobSchema = z.object({
  id: z.string().uuid(), org_id: z.string().uuid(), ticket_id: z.string().uuid(), trade_id: z.string().uuid().nullable().optional(),
  proposed_at: z.string().datetime({ offset: true }).optional(), dispatched_at: z.string().datetime({ offset: true }).nullable().optional(),
  dispatched_by: z.string().uuid().nullable().optional(), completed_at: z.string().datetime({ offset: true }).nullable().optional(), cost: MoneyGbpSchema.nullable().optional(),
});

/* ── Commitments ───────────────────────────────────────────────────────── */
export const CommitmentOwnerSchema = z.enum(["landlord", "tenant", "contractor", "support_worker", "council"]);
export const CommitmentStatusSchema = z.enum(["open", "done", "overdue"]);
export const CommitmentSchema = z.object({
  id: z.string().uuid(), org_id: z.string().uuid(), tenant_id: z.string().uuid().nullable().optional(), source_table: z.enum(["staff_notes", "sessions", "communications"]),
  source_id: z.string().uuid(), text: z.string().min(1), owner: CommitmentOwnerSchema, due_on: UkDateSchema.nullable().optional(),
  status: CommitmentStatusSchema.default("open"), done_at: z.string().datetime({ offset: true }).nullable().optional(), created_at: z.string().datetime({ offset: true }).optional(),
});

export type CertificateType = z.infer<typeof CertificateTypeSchema>;
export type Certificate = z.infer<typeof CertificateSchema>;
export type CertificateCreate = z.infer<typeof CertificateCreateSchema>;
export type AlertKind = z.infer<typeof AlertKindSchema>;
export type ComplianceAlert = z.infer<typeof ComplianceAlertSchema>;
export type InsurancePolicy = z.infer<typeof InsurancePolicySchema>;
export type InsuranceRenewalCycle = z.infer<typeof InsuranceRenewalCycleSchema>;
export type InsuranceQuote = z.infer<typeof InsuranceQuoteSchema>;
export type InsuranceDecision = z.infer<typeof InsuranceDecisionSchema>;
export type RegScope = z.infer<typeof RegScopeSchema>;
export type RegulationItem = z.infer<typeof RegulationItemSchema>;
export type RegulationImpact = z.infer<typeof RegulationImpactSchema>;
export type IssueVia = z.infer<typeof IssueViaSchema>;
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;
export type TriageResult = z.infer<typeof TriageResultSchema>;
export type PublicReport = z.infer<typeof PublicReportSchema>;
export type Trade = z.infer<typeof TradeSchema>;
export type DispatchJob = z.infer<typeof DispatchJobSchema>;
export type Commitment = z.infer<typeof CommitmentSchema>;
