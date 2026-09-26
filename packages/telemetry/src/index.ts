/**
 * @tenant-hub/telemetry — structured logs and agent spans. No database import:
 * the sink that persists events is injected by the caller (packages/db provides one).
 */

export const LEVELS = ["debug", "info", "warn", "error"] as const;
export type Level = (typeof LEVELS)[number];
export interface LogFields { [k: string]: unknown }

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

/** One JSON line per event. No PII in the message; put identifiers in fields. */
export function createLogger(opts: { level?: Level; service?: string; write?: (line: string, level: Level) => void } = {}): Logger {
  const min = LEVELS.indexOf(opts.level ?? "info");
  const service = opts.service ?? "tenant-hub";
  const write = opts.write ?? ((line, level) => (level === "error" ? console.error(line) : console.log(line)));
  const log = (level: Level, msg: string, fields: LogFields = {}) => {
    if (LEVELS.indexOf(level) < min) return;
    write(JSON.stringify({ ts: new Date().toISOString(), level, service, msg, ...fields }), level);
  };
  return {
    debug: (m, f) => log("debug", m, f), info: (m, f) => log("info", m, f),
    warn: (m, f) => log("warn", m, f), error: (m, f) => log("error", m, f),
  };
}

/** Default logger; apps may call setLogger() at startup with their level. */
let current: Logger = createLogger();
export const logger: Logger = {
  debug: (m, f) => current.debug(m, f), info: (m, f) => current.info(m, f),
  warn: (m, f) => current.warn(m, f), error: (m, f) => current.error(m, f),
};
export function setLogger(l: Logger) { current = l; }

/* ── Agent telemetry ────────────────────────────────────────────────────── */
export type AgentEventKind = "start" | "end" | "refusal" | "error" | "heartbeat";
export type AgentState = "idle" | "running" | "failed" | "halted";

export interface AgentEvent {
  orgId?: string | null; agent: string; event: AgentEventKind; level?: Level;
  correlationId?: string; durationMs?: number; fields?: LogFields;
}
export interface HealthPatch { state?: AgentState; lastError?: string | null; success?: boolean }

/** Persists events somewhere the console can read them. packages/db implements this. */
export interface TelemetrySink {
  emit(e: AgentEvent): Promise<void>;
  heartbeat(agent: string): Promise<void>;
  health(agent: string, patch: HealthPatch): Promise<void>;
}

/** An in-memory sink for tests and for running without a database. */
export function memorySink() {
  const events: AgentEvent[] = []; const beats: string[] = []; const health: { agent: string; patch: HealthPatch }[] = [];
  const sink: TelemetrySink = {
    async emit(e) { events.push(e); }, async heartbeat(a) { beats.push(a); }, async health(a, p) { health.push({ agent: a, patch: p }); },
  };
  return { sink, events, beats, health };
}

/**
 * Wrap an agent run: health → running, emit start; on success emit end + health
 * idle/success; on throw emit error + health failed, then rethrow. No silent work.
 */
export async function span<T>(sink: TelemetrySink, agent: string, orgId: string | null | undefined, correlationId: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  await sink.health(agent, { state: "running" });
  await sink.emit({ orgId, agent, event: "start", correlationId });
  logger.info("agent.start", { agent, orgId, correlationId });
  try {
    const out = await fn();
    const durationMs = Date.now() - t0;
    await sink.emit({ orgId, agent, event: "end", correlationId, durationMs });
    await sink.health(agent, { state: "idle", success: true, lastError: null });
    logger.info("agent.end", { agent, orgId, correlationId, durationMs });
    return out;
  } catch (e) {
    const durationMs = Date.now() - t0;
    const error = e instanceof Error ? e.message : String(e);
    await sink.emit({ orgId, agent, event: "error", level: "error", correlationId, durationMs, fields: { error } });
    await sink.health(agent, { state: "failed", success: false, lastError: error });
    logger.error("agent.error", { agent, orgId, correlationId, error });
    throw e;
  }
}

export const newCorrelationId = () => globalThis.crypto.randomUUID();
