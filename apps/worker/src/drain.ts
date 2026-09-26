/**
 * Drain: claim due jobs, run each agent inside a telemetry span, then complete,
 * retry with backoff, or dead-letter and tell a manager. Jobs run concurrently
 * up to the claim limit; in-flight jobs are tracked so shutdown can wait.
 */
import { claimJobs, completeJob, failJob, type DbClient } from "@tenant-hub/db";
import { span, logger, type TelemetrySink } from "@tenant-hub/telemetry";
import type { NotifyPort } from "@tenant-hub/ports";
import { getAgent } from "./registry";

const inflight = new Set<Promise<void>>();
/** Resolves when every in-flight job has finished, or after `ms`. */
export async function waitForInflight(ms: number) {
  await Promise.race([Promise.allSettled([...inflight]), new Promise((r) => setTimeout(r, ms))]);
}

export interface DrainDeps {
  client: DbClient;
  sink: TelemetrySink;
  notify: NotifyPort;
  /** Who to tell when a job dead-letters. */
  managerEmail: (orgId: string) => Promise<string | null>;
  isShuttingDown?: () => boolean;
  limit?: number;
}

export async function drainOnce(d: DrainDeps): Promise<number> {
  if (d.isShuttingDown?.()) return 0;
  const jobs = await claimJobs(d.client, d.limit ?? 5);
  await Promise.all(jobs.map(async (job) => {
    const agent = getAgent(job.job_type);
    const cid = job.correlation_id ?? crypto.randomUUID();
    if (!agent) {
      logger.warn("job.no_handler", { jobType: job.job_type, jobId: job.id });
      await failJob(d.client, job, `No agent registered for '${job.job_type}'`);
      return;
    }
    const run = (async () => {
      try {
        await span(d.sink, agent.name, job.org_id, cid, () => agent.fn({ client: d.client, orgId: job.org_id, correlationId: cid, payload: job.payload ?? {} }));
        await completeJob(d.client, job.id);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const r = await failJob(d.client, job, message);
        if (r.outcome === "dead_letter") {
          logger.error("job.dead_letter", { jobId: job.id, jobType: job.job_type, error: message, correlationId: cid });
          try {
            const to = await d.managerEmail(job.org_id);
            if (to) await d.notify.send({ to, channel: "email", subject: `An agent needs attention: ${agent.label}`,
              body: `${agent.label} failed ${r.attempt} times and has stopped. Last error: ${message}. Reference ${cid}.` });
          } catch { /* telling someone must never take the drain down */ }
        } else {
          logger.warn("job.retry", { jobId: job.id, attempt: r.attempt, nextRetryAt: r.nextRetryAt?.toISOString() });
        }
      }
    })();
    inflight.add(run);
    try { await run; } finally { inflight.delete(run); }
  }));
  return jobs.length;
}
