-- ============================================================
-- 004_fix_write_with_audit_upsert.sql
-- Fixes a silent no-op: 003's ON CONFLICT only set updated_at, so PATCH/UPDATE
-- never persisted changed columns. This rebuilds write_with_audit() to apply a
-- real partial UPDATE for existing rows, still atomic with the audit log +
-- stamp queue. See DECISIONS.md D7.
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
  v_set    TEXT;
  v_exists BOOLEAN := FALSE;
BEGIN
  v_id := NULLIF(p_record->>'id', '')::UUID;

  IF v_id IS NOT NULL THEN
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE id = $1)', p_table)
      USING v_id INTO v_exists;
  END IF;

  IF v_exists THEN
    -- Build "col = 'value'" for every provided key except id/timestamps.
    -- %L yields an untyped literal; Postgres assignment-casts it to each
    -- column's type (numeric / boolean / date / enum) on UPDATE.
    SELECT string_agg(format('%I = %L', key, value), ', ')
      INTO v_set
      FROM jsonb_each_text(p_record)
     WHERE key NOT IN ('id', 'created_at', 'updated_at');

    IF v_set IS NULL THEN
      EXECUTE format('UPDATE %I SET updated_at = NOW() WHERE id = $1 RETURNING to_jsonb(%I.*)',
                     p_table, p_table)
        USING v_id INTO v_result;
    ELSE
      EXECUTE format('UPDATE %I SET %s, updated_at = NOW() WHERE id = $1 RETURNING to_jsonb(%I.*)',
                     p_table, v_set, p_table)
        USING v_id INTO v_result;
    END IF;
  ELSE
    EXECUTE format(
      'INSERT INTO %I SELECT * FROM jsonb_populate_record(null::%I, $1) RETURNING to_jsonb(%I.*)',
      p_table, p_table, p_table
    ) USING p_record INTO v_result;
    v_id := (v_result->>'id')::UUID;
  END IF;

  -- Audit log (append-only)
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
    v_result,
    (p_audit->>'created_at')::TIMESTAMPTZ
  );

  -- Enqueue blockchain stamp (transactional outbox — H6)
  INSERT INTO stamp_queue (tenant_id, audit_hash, status)
  VALUES (
    CASE WHEN p_table = 'tenants' THEN v_id ELSE (p_audit->>'tenant_id')::UUID END,
    p_audit->>'hash',
    'pending'
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
