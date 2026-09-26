/**
 * Lifecycle: heartbeat every 15 s for every registered agent; graceful shutdown
 * on SIGTERM/SIGINT waits up to 20 s for in-flight jobs, then hands anything
 * still processing back to the queue and closes the pool.
 */
import { releaseProcessingJobs, closePool, type DbClient } from "@tenant-hub/db";
import { logger, type TelemetrySink } from "@tenant-hub/telemetry";
import { allAgents } from "./registry";
import { waitForInflight } from "./drain";

let shuttingDown = false;
export const isShuttingDown = () => shuttingDown;

export function startHeartbeat(sink: TelemetrySink, intervalMs = 15_000): NodeJS.Timeout {
  const beat = async () => { for (const a of allAgents()) await sink.heartbeat(a.name); };
  void beat();
  return setInterval(() => void beat(), intervalMs);
}

export function installGracefulShutdown(client: DbClient, timers: NodeJS.Timeout[], exit: (code: number) => void = (c) => process.exit(c)) {
  const stop = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn("worker.shutdown", { signal });
    for (const t of timers) clearInterval(t);
    await waitForInflight(20_000);
    const released = await releaseProcessingJobs(client).catch(() => 0);
    if (released) logger.warn("worker.released_jobs", { count: released });
    await closePool().catch(() => undefined);
    exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("unhandledRejection", (r) => logger.error("unhandledRejection", { error: String(r) }));
}
