/**
 * Agent registry. Each agent runs under a mandate, on a schedule, per organisation.
 * An agent is a plain async function: it receives the job payload, the org and a
 * correlation id, and does all of its writes through writeWithAudit with a receipt.
 */
import type { AgentMandate } from "@tenant-hub/kya";
import type { DbClient } from "@tenant-hub/db";

export interface AgentContext { client: DbClient; orgId: string; correlationId: string; payload: Record<string, unknown> }
export type AgentFn = (ctx: AgentContext) => Promise<void>;

export interface RegisteredAgent {
  name: string;
  /** Plain words for the console: "Certificate watch". */
  label: string;
  fn: AgentFn;
  mandate: AgentMandate;
  /** How often to run per organisation. 0 = on demand only. */
  scheduleMs: number;
}

const REGISTRY = new Map<string, RegisteredAgent>();
export function register(a: RegisteredAgent) { REGISTRY.set(a.name, a); }
export function getAgent(name: string) { return REGISTRY.get(name); }
export function allAgents() { return [...REGISTRY.values()]; }
export function _clearRegistryForTests() { REGISTRY.clear(); }

export const HOUR = 3_600_000;
export const DAY = 86_400_000;
