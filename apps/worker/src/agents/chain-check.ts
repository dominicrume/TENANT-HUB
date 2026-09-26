/**
 * chain-check — recomputes the audit hash chain every day (H12). The chain is
 * per record: each row's prev_hash must equal the previous row's hash for that
 * record, and where the hashed payload is stored (DECISIONS D17) the hash itself
 * must recompute. A break means history was touched; a manager hears at once.
 */
import { computeHash, GENESIS_HASH, type AuditEntry } from "@tenant-hub/audit";
import { withOutcome } from "@tenant-hub/kya";
import type { AgentContext } from "../registry";
import { mandate, read, receipt, notify, managerEmail } from "./common";

export const CHAIN_MANDATE = mandate("chain-check", ["audit_logs"], ["move_money", "bind_insurance", "send_legal_notice"]);
export const CHAIN_LABEL = "Audit chain check";

interface Row {
  id: string; record_id: string | null; table_name: string; action: AuditEntry["action"]; user_id: string | null; user_name: string | null; user_role: string | null;
  prev_hash: string; blockchain_hash: string; payload: unknown | null; entry_method: string | null; tenant_id: string | null; created_at: Date | string;
}

export interface ChainReport { rows: number; brokenLinks: number; badHashes: number; firstBroken: string | null }

export async function verifyChain(ctx: AgentContext): Promise<ChainReport> {
  const r = receipt("chain-check", "verify", "recorded");
  read(r, CHAIN_MANDATE, "audit_logs", "live");
  // Rows for this organisation, plus rows written before org_id existed for tenants of this org.
  const rows = (await ctx.client.query<Row>(
    `SELECT a.id, a.record_id, a.table_name, a.action, a.user_id, a.user_name, a.user_role, a.prev_hash, a.blockchain_hash, a.payload,
            a.entry_method, a.tenant_id, a.created_at
     FROM audit_logs a
     WHERE a.org_id = $1 OR (a.org_id IS NULL AND a.tenant_id IN (SELECT id FROM tenants WHERE org_id = $1))
     ORDER BY a.created_at, a.id`, [ctx.orgId])).rows;

  const lastByRecord = new Map<string, string>();
  const report: ChainReport = { rows: rows.length, brokenLinks: 0, badHashes: 0, firstBroken: null };
  for (const l of rows) {
    const key = l.record_id ?? l.id;
    const expectedPrev = lastByRecord.get(key) ?? GENESIS_HASH;
    if (l.prev_hash !== expectedPrev) { report.brokenLinks++; report.firstBroken ??= l.id; }
    if (l.payload !== null && l.payload !== undefined) {
      const h = await computeHash({
        table_name: l.table_name, record_id: l.record_id ?? "pending", action: l.action, payload: l.payload,
        user_id: l.user_id ?? "", user_name: l.user_name ?? "", user_role: l.user_role ?? "", prev_hash: l.prev_hash,
        entry_method: l.entry_method ?? undefined, tenant_id: l.tenant_id ?? undefined, created_at: new Date(l.created_at).toISOString(),
      });
      if (h !== l.blockchain_hash) { report.badHashes++; report.firstBroken ??= l.id; }
    }
    lastByRecord.set(key, l.blockchain_hash);
  }
  void withOutcome(r, "recorded");
  return report;
}

export async function chainCheck(ctx: AgentContext): Promise<void> {
  const report = await verifyChain(ctx);
  const broken = report.brokenLinks + report.badHashes;
  if (broken === 0) return;
  const to = await managerEmail(ctx.client, ctx.orgId);
  if (to) await notify().send({ to, channel: "email", subject: "Audit chain check FAILED",
    body: `${broken} of ${report.rows} audit rows do not match their hash chain (first: ${report.firstBroken}). Nothing has been changed by the system. Reference ${ctx.correlationId}.` });
  throw new Error(`audit chain broken: ${report.brokenLinks} links, ${report.badHashes} hashes (first ${report.firstBroken})`);
}
