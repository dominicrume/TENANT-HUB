/**
 * writeWithAudit — THE single write path for all DB mutations (H1).
 *
 * One transaction: upsert the record → append the hash-chained audit row →
 * enqueue the blockchain stamp (transactional outbox, H6). Any failure rolls
 * everything back, so an audit row can never exist without its write and a
 * write can never exist without its audit row.
 *
 * Runs on the pg driver (CON step 1). Until DATABASE_URL is configured it falls
 * back to the legacy write_with_audit RPC so production keeps working; that
 * seam is removed at C43 (DECISIONS D15). Both paths hit the same database.
 */
import { buildAuditRecord, GENESIS_HASH, type AuditEntry, type AuditReceipt } from "@tenant-hub/audit";
import { adminClient } from "./client";
import { db, hasDatabaseUrl, type DbClient, type Queryable } from "./pool";

export interface WriteAuditOptions<T extends Record<string, unknown>> {
  table:      string;
  record:     T;
  action:     AuditEntry["action"];
  user_id:    string;
  user_name:  string;
  user_role:  string;
  /** Previous hash for THIS record. Looked up inside the transaction when omitted. */
  prev_hash?: string;
  entry_method?: string;
  tenant_id?: string;
  /** Organisation the write belongs to; scopes the advisory lock and the audit row. */
  org_id?: string;
  /** KYA receipt when an agent wrote this (sources read, refusals, outcome). */
  receipt?: AuditReceipt;
  correlationId?: string;
  /** Test seam / explicit client. Defaults to the process-wide pg client. */
  client?: DbClient;
}

export interface WriteAuditResult<T> { data: T; audit_hash: string }

const SKIP_ON_UPDATE = new Set(["id", "created_at", "updated_at"]);

/** Columns per table, cached for the process. Lets one write path serve tables with or without updated_at. */
const columnCache = new Map<string, Set<string>>();
async function columnsOf(tx: Queryable, table: string): Promise<Set<string>> {
  const hit = columnCache.get(table);
  if (hit) return hit;
  const r = await tx.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1", [table]);
  const set = new Set(r.rows.map((x) => x.column_name));
  columnCache.set(table, set);
  return set;
}
export function _resetColumnCacheForTests() { columnCache.clear(); }

const ident = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`writeWithAudit: unsafe identifier "${name}"`);
  return `"${name}"`;
};
/** pg turns JS arrays into Postgres arrays; jsonb columns want JSON text. Encode objects and arrays explicitly. */
const param = (v: unknown) => (v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v);

export async function writeWithAudit<T extends Record<string, unknown>>(opts: WriteAuditOptions<T>): Promise<WriteAuditResult<T>> {
  if (!opts.client && !hasDatabaseUrl()) return writeViaRpc(opts);
  const client = opts.client ?? db();
  const timestamp = new Date().toISOString();

  return client.transaction(async (tx) => {
    // Serialise writes per organisation (or per record) so the chain never forks.
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [opts.org_id ?? `${opts.table}:${String(opts.record["id"] ?? "new")}`]);

    // 1. Upsert the record, preserving column defaults on insert.
    const cols = await columnsOf(tx, opts.table);
    const id = (opts.record["id"] as string | undefined) || undefined;
    let exists = false;
    if (id) {
      const r = await tx.query(`SELECT 1 FROM ${ident(opts.table)} WHERE id = $1`, [id]);
      exists = r.rows.length > 0;
    }
    let saved: T;
    if (exists) {
      const keys = Object.keys(opts.record).filter((k) => !SKIP_ON_UPDATE.has(k));
      const sets = keys.map((k, i) => `${ident(k)} = $${i + 2}`);
      if (cols.has("updated_at")) sets.push("updated_at = NOW()");
      const sql = sets.length
        ? `UPDATE ${ident(opts.table)} SET ${sets.join(", ")} WHERE id = $1 RETURNING *`
        : `SELECT * FROM ${ident(opts.table)} WHERE id = $1`;
      const r = await tx.query<T>(sql, [id, ...keys.map((k) => param(opts.record[k]))]);
      saved = r.rows[0]!;
    } else {
      const keys = Object.keys(opts.record).filter((k) => opts.record[k] !== undefined);
      const sql = keys.length
        ? `INSERT INTO ${ident(opts.table)} (${keys.map(ident).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`
        : `INSERT INTO ${ident(opts.table)} DEFAULT VALUES RETURNING *`;
      const r = await tx.query<T>(sql, keys.map((k) => param(opts.record[k])));
      saved = r.rows[0]!;
    }
    const recordId = String(saved["id"]);
    const tenantId = opts.table === "tenants" ? recordId : opts.tenant_id;

    // 2. Chain: the previous hash for THIS record, unless the caller already has it.
    let prev = opts.prev_hash;
    if (!prev) {
      const r = await tx.query<{ blockchain_hash: string }>(
        "SELECT blockchain_hash FROM audit_logs WHERE record_id = $1 ORDER BY created_at DESC LIMIT 1", [recordId]);
      prev = r.rows[0]?.blockchain_hash ?? GENESIS_HASH;
    }
    const audit = await buildAuditRecord({
      table_name: opts.table, record_id: recordId, action: opts.action, payload: opts.record,
      user_id: opts.user_id, user_name: opts.user_name, user_role: opts.user_role, prev_hash: prev,
      entry_method: opts.entry_method, tenant_id: tenantId,
      agent: opts.receipt?.agent, sources_read: opts.receipt?.sourcesRead, refusals: opts.receipt?.refusals,
      outcome: opts.receipt?.outcome, correlation_id: opts.correlationId,
    }, timestamp);

    // 3. Append the audit row. Receipt columns are written when the schema has them (C10).
    const auditCols = await columnsOf(tx, "audit_logs");
    const row: Record<string, unknown> = {
      tenant_id: tenantId ?? null, action: audit.action, table_name: opts.table, record_id: recordId,
      user_id: opts.user_id, user_name: opts.user_name, user_role: opts.user_role, entry_method: opts.entry_method ?? null,
      prev_hash: audit.prev_hash, blockchain_hash: audit.hash, record_snapshot: saved, created_at: timestamp,
    };
    const extra: Record<string, unknown> = {
      org_id: opts.org_id ?? null, agent: opts.receipt?.agent ?? null, sources_read: opts.receipt?.sourcesRead ?? null,
      refusals: opts.receipt?.refusals ?? null, outcome: opts.receipt?.outcome ?? null, correlation_id: opts.correlationId ?? null,
    };
    for (const [k, v] of Object.entries(extra)) if (auditCols.has(k)) row[k] = v;
    const ak = Object.keys(row);
    await tx.query(`INSERT INTO audit_logs (${ak.map(ident).join(", ")}) VALUES (${ak.map((_, i) => `$${i + 1}`).join(", ")})`, ak.map((k) => param(row[k])));

    // 4. Transactional outbox: the stamp is enqueued here and drained by the worker, never on the request path (H6).
    await tx.query("INSERT INTO stamp_queue (tenant_id, audit_hash, status) VALUES ($1, $2, 'pending')", [tenantId ?? null, audit.hash]);

    return { data: saved, audit_hash: audit.hash };
  });
}

/* ── Legacy path: the write_with_audit RPC. Removed at C43. ─────────────── */
let warned = false;
async function writeViaRpc<T extends Record<string, unknown>>(opts: WriteAuditOptions<T>): Promise<WriteAuditResult<T>> {
  if (!warned) { warned = true; console.warn("[writeWithAudit] DATABASE_URL not set — using the legacy RPC path (see DECISIONS D15)."); }
  const timestamp = new Date().toISOString();
  const auditRecord = await buildAuditRecord({
    table_name: opts.table, record_id: (opts.record["id"] as string) ?? "pending", action: opts.action, payload: opts.record,
    user_id: opts.user_id, user_name: opts.user_name, user_role: opts.user_role, prev_hash: opts.prev_hash ?? GENESIS_HASH,
    entry_method: opts.entry_method, tenant_id: opts.tenant_id,
  }, timestamp);
  let attempt = 0;
  for (;;) {
    try {
      const { data, error } = await adminClient.rpc("write_with_audit", { p_table: opts.table, p_record: opts.record, p_audit: auditRecord });
      if (error) throw new Error(error.message);
      return { data: data as T, audit_hash: auditRecord.hash };
    } catch (error) {
      attempt++;
      if (attempt >= 3) throw new Error(`writeWithAudit failed on ${opts.table} after 3 attempts: ${error instanceof Error ? error.message : String(error)}`);
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 200));
    }
  }
}
