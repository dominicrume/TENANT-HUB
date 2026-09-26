/**
 * The TelemetrySink that persists to Postgres (agent_telemetry, agent_health),
 * so "What the system did" can show live agent status. Failures to record
 * telemetry never take an agent down: they are logged and swallowed.
 */
import { logger, type TelemetrySink, type AgentEvent, type HealthPatch } from "@tenant-hub/telemetry";
import type { Queryable } from "./pool";

export function createPgTelemetrySink(client: Queryable): TelemetrySink {
  return {
    async emit(e: AgentEvent) {
      await client.query(
        `INSERT INTO agent_telemetry (org_id, agent, event, level, correlation_id, duration_ms, fields)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [e.orgId ?? null, e.agent, e.event, e.level ?? "info", e.correlationId ?? null, e.durationMs ?? null, JSON.stringify(e.fields ?? {})],
      ).catch((err: unknown) => logger.warn("telemetry.emit.fail", { error: String((err as Error)?.message) }));
    },
    async heartbeat(agent: string) {
      await client.query(
        `INSERT INTO agent_health (agent, last_heartbeat_at, updated_at) VALUES ($1, NOW(), NOW())
         ON CONFLICT (agent) DO UPDATE SET last_heartbeat_at = NOW(), updated_at = NOW()`, [agent],
      ).catch((err: unknown) => logger.warn("telemetry.heartbeat.fail", { error: String((err as Error)?.message) }));
    },
    async health(agent: string, p: HealthPatch) {
      // success is tri-state: undefined (e.g. "running") leaves the failure count and last error alone.
      const hasOutcome = p.success !== undefined;
      const hasError = p.lastError !== undefined;
      await client.query(
        `INSERT INTO agent_health (agent, state, last_run_at, last_success_at, last_error, consecutive_failures, updated_at)
         VALUES ($1, COALESCE($2::agent_state, 'idle'), NOW(),
                 CASE WHEN $3::boolean THEN NOW() ELSE NULL END,
                 $4::text,
                 CASE WHEN $5::boolean AND NOT $3::boolean THEN 1 ELSE 0 END, NOW())
         ON CONFLICT (agent) DO UPDATE SET
           state = COALESCE($2::agent_state, agent_health.state),
           last_run_at = NOW(),
           last_success_at = CASE WHEN $3::boolean THEN NOW() ELSE agent_health.last_success_at END,
           last_error = CASE WHEN $6::boolean THEN $4::text ELSE agent_health.last_error END,
           consecutive_failures = CASE WHEN NOT $5::boolean THEN agent_health.consecutive_failures
                                       WHEN $3::boolean THEN 0 ELSE agent_health.consecutive_failures + 1 END,
           updated_at = NOW()`,
        [agent, p.state ?? null, p.success ?? false, p.lastError ?? null, hasOutcome, hasError],
      ).catch((err: unknown) => logger.warn("telemetry.health.fail", { error: String((err as Error)?.message) }));
    },
  };
}

/** Seconds since the newest heartbeat across all agents; null when no agent has ever checked in. */
export async function workerHeartbeatAge(client: Queryable): Promise<{ ageSeconds: number | null; agents: number }> {
  const r = await client.query<{ t: Date | string | null; n: string | number }>("SELECT max(last_heartbeat_at) t, count(*)::int n FROM agent_health");
  const t = r.rows[0]?.t;
  return { ageSeconds: t ? Math.round((Date.now() - new Date(t).getTime()) / 1000) : null, agents: Number(r.rows[0]?.n ?? 0) };
}
