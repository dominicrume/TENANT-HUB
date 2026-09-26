/**
 * @tenant-hub/kya — Know Your Agent: mandates and receipts. PURE. No infrastructure.
 *
 * Every agent runs under a mandate (what it may read, what it may never do) and
 * leaves a receipt on every write (what it read, what it refused, how it ended).
 * The receipt is stored on the audit row (H12) and shown on "What the system did".
 * A refusal is not a failure: it is the ✋ row that proves the boundary held.
 */

export type ReceiptOutcome = "proposed" | "recorded" | "refused" | "decided";
export type SourceMode = "live" | "simulated";

export interface AgentMandate {
  agent: string;
  /** Source keys the agent may read, e.g. "tenancy_arrears", "sim:bank". */
  mayRead: readonly string[];
  /** Verbs the agent may never perform, e.g. "send_legal_notice", "move_money". */
  mayNeverDo: readonly string[];
  /** ISO timestamp. An expired mandate refuses every read. */
  expiresAt: string;
}

export interface SourceRead { key: string; version: string; retrievedAt: string; mode: SourceMode }
export interface Refusal { attempted: string; reason: string }

export interface ActionReceipt {
  agent: string;
  action: string;
  sourcesRead: SourceRead[];
  refusals: Refusal[];
  outcome: ReceiptOutcome;
}

export class MandateViolation extends Error {
  constructor(message: string, public readonly agent: string, public readonly attempted: string) {
    super(message); this.name = "MandateViolation";
  }
}

const YEAR_MS = 365 * 864e5;

/** Build a mandate that expires in one year unless told otherwise. */
export function mandate(agent: string, mayRead: readonly string[], mayNeverDo: readonly string[], expiresAt?: string): AgentMandate {
  return { agent, mayRead, mayNeverDo, expiresAt: expiresAt ?? new Date(Date.now() + YEAR_MS).toISOString() };
}

export function isExpired(m: AgentMandate, now = new Date()): boolean {
  return new Date(m.expiresAt).getTime() < now.getTime();
}

/** Throws unless the mandate allows reading `key` and has not expired. */
export function assertMayRead(m: AgentMandate, key: string, now = new Date()): void {
  if (isExpired(m, now)) throw new MandateViolation(`${m.agent} mandate expired ${m.expiresAt}`, m.agent, `read:${key}`);
  if (!m.mayRead.includes(key)) throw new MandateViolation(`${m.agent} may not read '${key}'`, m.agent, `read:${key}`);
}

/** Throws if `action` is on the agent's never-do list. */
export function assertMayDo(m: AgentMandate, action: string): void {
  if (m.mayNeverDo.includes(action)) throw new MandateViolation(`${m.agent} may never '${action}'`, m.agent, action);
}

export function newReceipt(agent: string, action: string, outcome: ReceiptOutcome = "proposed"): ActionReceipt {
  return { agent, action, sourcesRead: [], refusals: [], outcome };
}

/** Record a source read on the receipt, after the mandate allows it. */
export function read(r: ActionReceipt, m: AgentMandate, key: string, mode: SourceMode, version = new Date().toISOString(), now = new Date()): ActionReceipt {
  assertMayRead(m, key, now);
  r.sourcesRead.push({ key, version, retrievedAt: now.toISOString(), mode });
  return r;
}

/**
 * The ✋ row: the agent reaches a boundary and says so. Never throws for a known
 * boundary — the refusal is the outcome. Throws only if the action was allowed
 * (then refusing it is a programming error worth surfacing).
 */
export function refuse(r: ActionReceipt, m: AgentMandate, action: string, reason: string): ActionReceipt {
  if (!m.mayNeverDo.includes(action)) throw new Error(`${m.agent}: '${action}' is not on the never-do list — refuse() is for mandate boundaries`);
  r.refusals.push({ attempted: action, reason: `Not in mandate — ${reason}` });
  r.outcome = "proposed";
  return r;
}

/** A shallow copy with a different outcome, for writes that record rather than propose. */
export function withOutcome(r: ActionReceipt, outcome: ReceiptOutcome): ActionReceipt {
  return { ...r, sourcesRead: [...r.sourcesRead], refusals: [...r.refusals], outcome };
}
