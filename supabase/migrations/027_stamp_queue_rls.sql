-- Migration: 027_stamp_queue_rls.sql
-- FEATURE: Deep RBAC Hardening (DLQ Retry Policies)

-- Allow managers and admins to update the stamp_queue (required to retry dead letters)
DROP POLICY IF EXISTS "org_stamp_update" ON stamp_queue;
CREATE POLICY "org_stamp_update"
  ON stamp_queue FOR UPDATE
  USING (
    tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()) 
    AND get_my_role() IN ('manager', 'admin')
  );
