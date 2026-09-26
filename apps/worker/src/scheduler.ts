/**
 * Scheduler: once per interval, per organisation, enqueue each scheduled agent.
 * Idempotent through the dedupe key `agent:bucket`, and through hasRecentJob so a
 * job finished inside the interval is not queued again. Hands back jobs a dead
 * worker left in 'processing'. Skips organisations younger than two minutes.
 */
import { enqueueJob, hasRecentJob, organisationsForAgents, recoverStuckJobs, type DbClient } from "@tenant-hub/db";
import { logger, newCorrelationId } from "@tenant-hub/telemetry";
import { allAgents } from "./registry";

export async function scheduleDue(client: DbClient, now = Date.now()): Promise<number> {
  const recovered = await recoverStuckJobs(client, 30);
  if (recovered) logger.warn("job.recovered_stuck", { count: recovered });
  const orgs = await organisationsForAgents(client, 2);
  let queued = 0;
  for (const a of allAgents()) {
    if (a.scheduleMs <= 0) continue;
    const bucket = Math.floor(now / a.scheduleMs);
    for (const o of orgs) {
      if (await hasRecentJob(client, o.id, a.name, a.scheduleMs)) continue;
      const id = await enqueueJob(client, { orgId: o.id, jobType: a.name, dedupeKey: `${a.name}:${bucket}`, correlationId: newCorrelationId() });
      if (id) { queued++; logger.info("job.scheduled", { jobType: a.name, orgId: o.id, jobId: id }); }
    }
  }
  return queued;
}
