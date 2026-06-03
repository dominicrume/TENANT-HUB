/**
 * writeWithAudit — THE single write path for all DB mutations.
 * Every call produces an immutable audit log entry.
 * Never call supabase.from(...).insert/update outside this function.
 */
import { buildAuditRecord, GENESIS_HASH, type AuditEntry } from "@tenant-hub/audit";
import { adminClient } from "./client";

export interface WriteAuditOptions<T extends Record<string, unknown>> {
  table:      string;
  record:     T;
  action:     AuditEntry["action"];
  user_id:    string;
  user_name:  string;
  user_role:  string;
  prev_hash?: string;
  entry_method?: string;
  tenant_id?: string;
}

export async function writeWithAudit<T extends Record<string, unknown>>(
  opts: WriteAuditOptions<T>
): Promise<{ data: T; audit_hash: string }> {
  const timestamp = new Date().toISOString();

  const entry: AuditEntry = {
    table_name:   opts.table,
    record_id:    (opts.record["id"] as string) ?? "pending",
    action:       opts.action,
    payload:      opts.record,
    user_id:      opts.user_id,
    user_name:    opts.user_name,
    user_role:    opts.user_role,
    prev_hash:    opts.prev_hash ?? GENESIS_HASH,
    entry_method: opts.entry_method,
    tenant_id:    opts.tenant_id,
  };

  const auditRecord = await buildAuditRecord(entry, timestamp);

  // Atomic: write record + audit log in one RPC call
  const { data, error } = await adminClient.rpc("write_with_audit", {
    p_table:      opts.table,
    p_record:     opts.record,
    p_audit:      auditRecord,
  });

  if (error) throw new Error(`writeWithAudit failed on ${opts.table}: ${error.message}`);

  return { data: data as T, audit_hash: auditRecord.hash };
}
