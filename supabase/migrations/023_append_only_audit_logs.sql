-- Migration: 023_append_only_audit_logs.sql
-- PURPOSE: Ensure audit_logs is strictly append-only and add org_id indexes for performance.

-- 1. Index org_id for fast RLS isolation
CREATE INDEX IF NOT EXISTS idx_tenants_org_id ON tenants(org_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON profiles(org_id);

-- 2. Enforce Append-Only on audit_logs at the database level
CREATE OR REPLACE FUNCTION deny_update_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'This table is append-only. Updates and deletes are forbidden for audit integrity.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_append_only ON audit_logs;
CREATE TRIGGER trg_audit_logs_append_only
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
