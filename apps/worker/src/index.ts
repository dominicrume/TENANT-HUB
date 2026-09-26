/**
 * The agent runtime (docs/BUILD_PLAN.md C14). One long-running process:
 *   register agents → heartbeat every 15 s → every WORKER_POLL_MS: schedule due
 *   jobs per organisation, drain them inside telemetry spans, drain the stamp
 *   outbox → graceful shutdown on SIGTERM.
 *
 * H6: nothing here ever runs on an HTTP request path.
 * Until DATABASE_URL is configured the runtime cannot start; it says so and
 * runs the legacy stamp drainer only, so stamping never stops (DECISIONS D15).
 */
import { env } from "@tenant-hub/env";
import { db, hasDatabaseUrl, createPgTelemetrySink, getPendingStamps, updateStampStatus } from "@tenant-hub/db";
import { stampAuditHash } from "@tenant-hub/blockchain";
import { createLogger, logger, setLogger } from "@tenant-hub/telemetry";
import { notifier } from "@tenant-hub/adapters";
import { register, allAgents, DAY, HOUR } from "./registry";
import { scheduleDue } from "./scheduler";
import { drainOnce } from "./drain";
import { startHeartbeat, installGracefulShutdown, isShuttingDown } from "./lifecycle";
import { drainStamps } from "./agents/chain-stamp";
import { chainCheck, CHAIN_MANDATE, CHAIN_LABEL } from "./agents/chain-check";
import { complianceWatch, COMPLIANCE_MANDATE, COMPLIANCE_LABEL } from "./agents/compliance-watch";
import { rentReconciliation, RENT_MANDATE, RENT_LABEL } from "./agents/rent-reconciliation";
import { arrearsLadder, ARREARS_MANDATE, ARREARS_LABEL } from "./agents/arrears-ladder";
import { issueTriage, TRIAGE_MANDATE, TRIAGE_LABEL } from "./agents/issue-triage";
import { interactionMemory, MEMORY_MANDATE, MEMORY_LABEL } from "./agents/interaction-memory";
import { ownerDigest, DIGEST_MANDATE, DIGEST_LABEL } from "./agents/owner-digest";
import { regulationWatch, REGULATION_MANDATE, REGULATION_LABEL } from "./agents/regulation-watch";
import { insuranceRenewal, INSURANCE_MANDATE, INSURANCE_LABEL } from "./agents/insurance-renewal";
import { managerEmail } from "./agents/common";

setLogger(createLogger({ level: env.server.LOG_LEVEL, service: "tenant-hub-worker" }));

export function registerAgents() {
  register({ name: "chain-check", label: CHAIN_LABEL, fn: chainCheck, mandate: CHAIN_MANDATE, scheduleMs: DAY });
  register({ name: "compliance-watch", label: COMPLIANCE_LABEL, fn: complianceWatch, mandate: COMPLIANCE_MANDATE, scheduleMs: DAY });
  register({ name: "rent-reconciliation", label: RENT_LABEL, fn: rentReconciliation, mandate: RENT_MANDATE, scheduleMs: DAY });
  register({ name: "arrears-ladder", label: ARREARS_LABEL, fn: arrearsLadder, mandate: ARREARS_MANDATE, scheduleMs: DAY });
  register({ name: "issue-triage", label: TRIAGE_LABEL, fn: issueTriage, mandate: TRIAGE_MANDATE, scheduleMs: HOUR });
  register({ name: "interaction-memory", label: MEMORY_LABEL, fn: interactionMemory, mandate: MEMORY_MANDATE, scheduleMs: DAY });
  register({ name: "owner-digest", label: DIGEST_LABEL, fn: ownerDigest, mandate: DIGEST_MANDATE, scheduleMs: DAY });
  register({ name: "regulation-watch", label: REGULATION_LABEL, fn: regulationWatch, mandate: REGULATION_MANDATE, scheduleMs: DAY });
  register({ name: "insurance-renewal", label: INSURANCE_LABEL, fn: insuranceRenewal, mandate: INSURANCE_MANDATE, scheduleMs: DAY });
  // M4 complete. Screens land in M5 (C29+).
}

async function main() {
  registerAgents();
  if (!hasDatabaseUrl()) {
    logger.error("worker.no_database_url", { detail: "DATABASE_URL is not set; the agent runtime cannot start. Running the legacy stamp drainer only." });
    return legacyStampLoop();
  }
  const client = db();
  const sink = createPgTelemetrySink(client);
  const notify = notifier();
  const timers: NodeJS.Timeout[] = [];
  timers.push(startHeartbeat(sink, 15_000));
  const tick = async () => {
    if (isShuttingDown()) return;
    await scheduleDue(client).catch((e) => logger.error("schedule.fail", { error: String((e as Error)?.message) }));
    await drainOnce({ client, sink, notify, managerEmail: (org) => managerEmail(client, org), isShuttingDown }).catch((e) => logger.error("drain.fail", { error: String((e as Error)?.message) }));
    await drainStamps({ client, sink }).catch((e) => logger.error("stamps.fail", { error: String((e as Error)?.message) }));
  };
  timers.push(setInterval(() => void tick(), env.server.WORKER_POLL_MS));
  installGracefulShutdown(client, timers);
  logger.info("worker.up", { agents: allAgents().map((a) => a.name), pollMs: env.server.WORKER_POLL_MS });
  await tick();
}

/** Pre-DATABASE_URL behaviour: the original stamp worker, unchanged in effect. */
async function legacyStampLoop() {
  const POLL = env.server.WORKER_POLL_MS;
  const run = async () => {
    try {
      for (const job of await getPendingStamps(10)) {
        try {
          await updateStampStatus(job.id, { status: "processing" });
          const tx = await stampAuditHash(job.audit_hash, env.server.POLYGON_RPC_URL ?? "", env.server.STAMP_WALLET_PRIVATE_KEY ?? "");
          await updateStampStatus(job.id, { status: "done", tx_hash: tx });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const next = (job.retry_count ?? 0) + 1;
          if (next >= 3) await updateStampStatus(job.id, { status: "dead_letter", error: message, retry_count: next, next_retry_at: null });
          else await updateStampStatus(job.id, { status: "pending", error: message, retry_count: next, next_retry_at: new Date(Date.now() + Math.pow(2, next) * 60_000).toISOString() });
        }
      }
    } catch (e) { logger.error("stamps.legacy.fail", { error: String((e as Error)?.message) }); }
    setTimeout(() => void run(), POLL);
  };
  logger.info("worker.legacy_stamps.up", { pollMs: POLL });
  await run();
}

if (process.env["VITEST"] === undefined) void main();
