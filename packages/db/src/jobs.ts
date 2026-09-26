/**
 * The job queue (supabase/migrations/031_agent_runtime.sql), used only by the
 * worker and by routes that ask an agent to run now. Every function takes the
 * client so tests run on pglite; production passes the default db().
 */
import type { Job } from "@tenant-hub/validation";
import type { DbClient, Queryable } from "./pool";

export interface EnqueueInput {
  orgId: string;
  jobType: string;
  payload?: Record<string, unknown>;
  /** Same key while a job is pending/processing → no duplicate is queued. */
  dedupeKey?: string;
  correlationId?: string;
  scheduledAt?: Date;
  maxRetries?: number;
}

/** Queue a job. Returns the id, or null when a live job with the same dedupe key exists. */
export async function enqueueJob(client: Queryable, i: EnqueueInput): Promise<string | null> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO jobs (org_id, job_type, payload, dedupe_key, correlation_id, scheduled_at, max_retries)
     VALUES ($1, $2, $3, $4, COALESCE($5, gen_random_uuid()::text), COALESCE($6, NOW()), COALESCE($7, 3))
     ON CONFLICT DO NOTHING RETURNING id`,
    [i.orgId, i.jobType, JSON.stringify(i.payload ?? {}), i.dedupeKey ?? null, i.correlationId ?? null, i.scheduledAt ?? null, i.maxRetries ?? null]);
  return r.rows[0]?.id ?? null;
}

/**
 * Claim up to `limit` due jobs for this worker: pending or failed, scheduled by
 * now, oldest first. SKIP LOCKED lets several workers drain the same queue.
 */
export async function claimJobs(client: DbClient, limit = 5): Promise<Job[]> {
  const r = await client.query<Job>(
    `UPDATE jobs SET status = 'processing', started_at = NOW(), updated_at = NOW()
     WHERE id IN (
       SELECT id FROM jobs WHERE status IN ('pending','failed') AND scheduled_at <= NOW()
       ORDER BY scheduled_at LIMIT $1 FOR UPDATE SKIP LOCKED)
     RETURNING *`, [limit]);
  return r.rows;
}

export async function completeJob(client: Queryable, id: string): Promise<void> {
  await client.query("UPDATE jobs SET status = 'done', finished_at = NOW(), error = NULL, updated_at = NOW() WHERE id = $1", [id]);
}

/** Exponential backoff in minutes per attempt: 2, 4, 8, then 8. */
export const BACKOFF_MINUTES = [2, 4, 8] as const;

/**
 * Record a failure. Retries with backoff until max_retries, then dead-letters.
 * Returns what happened so the caller can alert on dead letters.
 */
export async function failJob(client: Queryable, job: Pick<Job, "id" | "retry_count" | "max_retries">, error: string): Promise<{ outcome: "retry" | "dead_letter"; attempt: number; nextRetryAt: Date | null }> {
  const attempt = (job.retry_count ?? 0) + 1;
  if (attempt >= (job.max_retries ?? 3)) {
    await client.query(
      "UPDATE jobs SET status = 'dead_letter', error = $2, retry_count = $3, finished_at = NOW(), updated_at = NOW() WHERE id = $1",
      [job.id, error.slice(0, 2000), attempt]);
    return { outcome: "dead_letter", attempt, nextRetryAt: null };
  }
  const minutes = BACKOFF_MINUTES[attempt - 1] ?? BACKOFF_MINUTES[BACKOFF_MINUTES.length - 1]!;
  const nextRetryAt = new Date(Date.now() + minutes * 60_000);
  await client.query(
    "UPDATE jobs SET status = 'failed', error = $2, retry_count = $3, scheduled_at = $4, next_retry_at = $4, updated_at = NOW() WHERE id = $1",
    [job.id, error.slice(0, 2000), attempt, nextRetryAt]);
  return { outcome: "retry", attempt, nextRetryAt };
}

/** A job left 'processing' longer than `minutes` belongs to a worker that died; hand it back. */
export async function recoverStuckJobs(client: Queryable, minutes = 30): Promise<number> {
  const r = await client.query(
    `UPDATE jobs SET status = 'pending', started_at = NULL, updated_at = NOW()
     WHERE status = 'processing' AND started_at < NOW() - ($1 || ' minutes')::interval`, [String(minutes)]);
  return r.rowCount ?? 0;
}

/** On shutdown: release everything this process was still running. */
export async function releaseProcessingJobs(client: Queryable): Promise<number> {
  const r = await client.query("UPDATE jobs SET status = 'pending', started_at = NULL, updated_at = NOW() WHERE status = 'processing'");
  return r.rowCount ?? 0;
}

/** True when a job of this type is live, or finished within `withinMs`, for the org — the scheduler's dedupe. */
export async function hasRecentJob(client: Queryable, orgId: string, jobType: string, withinMs: number): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM jobs WHERE org_id = $1 AND job_type = $2
       AND (status IN ('pending','processing') OR (status = 'done' AND finished_at > NOW() - ($3 || ' milliseconds')::interval))
     LIMIT 1`, [orgId, jobType, String(withinMs)]);
  return r.rows.length > 0;
}

/** Organisations old enough for agents to look at (a brand-new org may still be seeding). */
export async function organisationsForAgents(client: Queryable, minAgeMinutes = 2): Promise<{ id: string }[]> {
  const r = await client.query<{ id: string }>(
    "SELECT id FROM organisations WHERE created_at < NOW() - ($1 || ' minutes')::interval ORDER BY created_at", [String(minAgeMinutes)]);
  return r.rows;
}

export async function deadLetterCount(client: Queryable): Promise<number> {
  const r = await client.query<{ n: string | number }>("SELECT count(*) n FROM jobs WHERE status = 'dead_letter'");
  return Number(r.rows[0]?.n ?? 0);
}
