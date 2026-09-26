/**
 * Agent runtime schemas — canonical shapes for the jobs queue, agent health and
 * agent telemetry (supabase/migrations/031_agent_runtime.sql). z.infer is the
 * only source of these types anywhere in the monorepo.
 */
import { z } from "zod";

export const JobStatusSchema = z.enum(["pending", "processing", "done", "failed", "dead_letter", "cancelled"]);
export const AgentStateSchema = z.enum(["idle", "running", "failed", "halted"]);
export const AgentEventSchema = z.enum(["start", "end", "refusal", "error", "heartbeat"]);
export const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);
export const AuditOutcomeSchema = z.enum(["proposed", "recorded", "refused", "decided"]);

export const JobSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  job_type: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
  status: JobStatusSchema.default("pending"),
  retry_count: z.number().int().nonnegative().default(0),
  max_retries: z.number().int().positive().default(3),
  dedupe_key: z.string().nullable().optional(),
  correlation_id: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  scheduled_at: z.string().datetime({ offset: true }).optional(),
  next_retry_at: z.string().datetime({ offset: true }).nullable().optional(),
  started_at: z.string().datetime({ offset: true }).nullable().optional(),
  finished_at: z.string().datetime({ offset: true }).nullable().optional(),
  created_at: z.string().datetime({ offset: true }).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
});
export const JobEnqueueSchema = JobSchema.pick({ org_id: true, job_type: true }).extend({
  payload: z.record(z.unknown()).default({}),
  dedupe_key: z.string().optional(),
  correlation_id: z.string().optional(),
  scheduled_at: z.string().datetime({ offset: true }).optional(),
});

export const AgentHealthSchema = z.object({
  agent: z.string().min(1),
  state: AgentStateSchema.default("idle"),
  last_heartbeat_at: z.string().datetime({ offset: true }).nullable().optional(),
  last_run_at: z.string().datetime({ offset: true }).nullable().optional(),
  last_success_at: z.string().datetime({ offset: true }).nullable().optional(),
  last_error: z.string().nullable().optional(),
  consecutive_failures: z.number().int().nonnegative().default(0),
  updated_at: z.string().datetime({ offset: true }).optional(),
});

export const AgentTelemetrySchema = z.object({
  id: z.string().uuid().optional(),
  org_id: z.string().uuid().nullable().optional(),
  agent: z.string().min(1),
  event: AgentEventSchema,
  level: LogLevelSchema.default("info"),
  correlation_id: z.string().nullable().optional(),
  duration_ms: z.number().int().nonnegative().nullable().optional(),
  fields: z.record(z.unknown()).nullable().optional(),
  created_at: z.string().datetime({ offset: true }).optional(),
});

export type JobStatus = z.infer<typeof JobStatusSchema>;
export type AgentState = z.infer<typeof AgentStateSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>;
export type Job = z.infer<typeof JobSchema>;
export type JobEnqueue = z.infer<typeof JobEnqueueSchema>;
export type AgentHealth = z.infer<typeof AgentHealthSchema>;
export type AgentTelemetry = z.infer<typeof AgentTelemetrySchema>;
