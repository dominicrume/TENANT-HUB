-- Migration: 017_strict_rls_isolation.sql
-- PURPOSE: Enforce strict SaaS workspace isolation across all tables using org_id

-- 1. Drop old permissive policies
DROP POLICY IF EXISTS "own_profile_read" ON profiles;
DROP POLICY IF EXISTS "manager_all_profiles" ON profiles;

DROP POLICY IF EXISTS "manager_all_tenants" ON tenants;
DROP POLICY IF EXISTS "worker_read_all_tenants" ON tenants;
DROP POLICY IF EXISTS "worker_create_tenant" ON tenants;
DROP POLICY IF EXISTS "worker_update_tenant" ON tenants;
DROP POLICY IF EXISTS "tenant_read_own" ON tenants;

DROP POLICY IF EXISTS "staff_all_sessions" ON sessions;
DROP POLICY IF EXISTS "manager_all_charges" ON service_charges;
DROP POLICY IF EXISTS "worker_read_charges" ON service_charges;
DROP POLICY IF EXISTS "manager_read_audit" ON audit_logs;
DROP POLICY IF EXISTS "manager_read_stamps" ON stamp_queue;
DROP POLICY IF EXISTS "own_draft" ON drafts;

-- Helper to safely get the current user's org_id
CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. Profiles: Users can only see profiles within their own organisation
CREATE POLICY "org_profiles_read"
  ON profiles FOR SELECT 
  USING (org_id = get_my_org_id() OR id = auth.uid());

CREATE POLICY "manager_update_org_profiles"
  ON profiles FOR UPDATE
  USING (org_id = get_my_org_id() AND get_my_role() = 'manager');

-- 3. Tenants: Strict org isolation
CREATE POLICY "org_tenants_read"
  ON tenants FOR SELECT
  USING (org_id = get_my_org_id());

CREATE POLICY "org_tenants_insert"
  ON tenants FOR INSERT
  WITH CHECK (org_id = get_my_org_id() AND get_my_role() IN ('manager', 'support_worker'));

CREATE POLICY "org_tenants_update"
  ON tenants FOR UPDATE
  USING (org_id = get_my_org_id() AND get_my_role() IN ('manager', 'support_worker'));

CREATE POLICY "org_tenants_delete"
  ON tenants FOR DELETE
  USING (org_id = get_my_org_id() AND get_my_role() = 'manager');

-- 4. Sessions (Linked to Tenant)
CREATE POLICY "org_sessions_read"
  ON sessions FOR SELECT
  USING (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()));

CREATE POLICY "org_sessions_insert"
  ON sessions FOR INSERT
  WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()) AND get_my_role() IN ('manager', 'support_worker'));

CREATE POLICY "org_sessions_update"
  ON sessions FOR UPDATE
  USING (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()) AND get_my_role() IN ('manager', 'support_worker'));

CREATE POLICY "org_sessions_delete"
  ON sessions FOR DELETE
  USING (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()) AND get_my_role() = 'manager');

-- 5. Service Charges (Linked to Tenant)
CREATE POLICY "org_charges_read"
  ON service_charges FOR SELECT
  USING (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()));

CREATE POLICY "org_charges_insert"
  ON service_charges FOR INSERT
  WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()) AND get_my_role() IN ('manager', 'support_worker'));

CREATE POLICY "org_charges_update"
  ON service_charges FOR UPDATE
  USING (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()) AND get_my_role() IN ('manager', 'support_worker'));

CREATE POLICY "org_charges_delete"
  ON service_charges FOR DELETE
  USING (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()) AND get_my_role() = 'manager');

-- 6. Audit Logs (Linked to Tenant or User Org)
CREATE POLICY "org_audit_read"
  ON audit_logs FOR SELECT
  USING (
    tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()) 
    OR user_id IN (SELECT id FROM profiles WHERE org_id = get_my_org_id())
  );

-- 7. Drafts (Owned by User)
CREATE POLICY "org_draft_read"
  ON drafts FOR SELECT
  USING (created_by IN (SELECT id FROM profiles WHERE org_id = get_my_org_id()));

CREATE POLICY "org_draft_insert"
  ON drafts FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "org_draft_update"
  ON drafts FOR UPDATE
  USING (created_by = auth.uid());

CREATE POLICY "org_draft_delete"
  ON drafts FOR DELETE
  USING (created_by = auth.uid());

-- 8. Stamp Queue
CREATE POLICY "org_stamp_read"
  ON stamp_queue FOR SELECT
  USING (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()));

-- 9. Intake Checklists
CREATE POLICY "org_checklist_read"
  ON intake_checklists FOR SELECT
  USING (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()));

CREATE POLICY "org_checklist_insert"
  ON intake_checklists FOR INSERT
  WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()) AND get_my_role() IN ('manager', 'support_worker'));

CREATE POLICY "org_checklist_update"
  ON intake_checklists FOR UPDATE
  USING (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()) AND get_my_role() IN ('manager', 'support_worker'));
