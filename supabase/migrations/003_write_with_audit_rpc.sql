-- ============================================================
-- 003_write_with_audit_rpc.sql
-- Atomic: write record + audit log in ONE transaction
-- Called by packages/db/src/write-with-audit.ts
-- ============================================================

CREATE OR REPLACE FUNCTION write_with_audit(
  p_table  TEXT,
  p_record JSONB,
  p_audit  JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_id     UUID;
BEGIN
  -- Upsert the record
  EXECUTE format(
    'INSERT INTO %I SELECT * FROM jsonb_populate_record(null::%I, $1)
     ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
     RETURNING to_jsonb(%I.*)',
    p_table, p_table, p_table
  ) USING p_record INTO v_result;

  v_id := (v_result->>'id')::UUID;

  -- Write audit log
  INSERT INTO audit_logs (
    tenant_id, action, table_name, record_id,
    user_id, user_name, user_role, entry_method,
    prev_hash, blockchain_hash, record_snapshot, created_at
  ) VALUES (
    CASE WHEN p_table = 'tenants' THEN v_id ELSE (p_audit->>'tenant_id')::UUID END,
    (p_audit->>'action')::audit_action,
    p_table,
    v_id,
    (p_audit->>'user_id')::UUID,
    p_audit->>'user_name',
    p_audit->>'user_role',
    p_audit->>'entry_method',
    p_audit->>'prev_hash',
    p_audit->>'hash',
    p_record,
    (p_audit->>'created_at')::TIMESTAMPTZ
  );

  -- Enqueue blockchain stamp
  INSERT INTO stamp_queue (tenant_id, audit_hash, status)
  VALUES (
    CASE WHEN p_table = 'tenants' THEN v_id ELSE (p_audit->>'tenant_id')::UUID END,
    p_audit->>'hash',
    'pending'
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
