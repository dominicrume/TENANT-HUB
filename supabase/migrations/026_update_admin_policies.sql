-- Migration: 026_update_admin_policies.sql
-- FEATURE: Deep RBAC Hardening (Admin vs Manager) Policies

-- Profiles: Admins can update any profile in their org, just like managers.
DROP POLICY IF EXISTS "manager_update_org_profiles" ON profiles;
CREATE POLICY "admin_manager_update_org_profiles"
  ON profiles FOR UPDATE
  USING (org_id = get_my_org_id() AND get_my_role() IN ('manager', 'admin'));

-- Tenants: Admins can delete tenants.
DROP POLICY IF EXISTS "org_tenants_delete" ON tenants;
CREATE POLICY "org_tenants_delete"
  ON tenants FOR DELETE
  USING (org_id = get_my_org_id() AND get_my_role() IN ('manager', 'admin'));

-- Tenants Insert/Update
DROP POLICY IF EXISTS "org_tenants_insert" ON tenants;
CREATE POLICY "org_tenants_insert" ON tenants FOR INSERT
  WITH CHECK (org_id = get_my_org_id() AND get_my_role() IN ('manager', 'support_worker', 'admin'));

DROP POLICY IF EXISTS "org_tenants_update" ON tenants;
CREATE POLICY "org_tenants_update" ON tenants FOR UPDATE
  USING (org_id = get_my_org_id() AND get_my_role() IN ('manager', 'support_worker', 'admin'));

-- Sessions
DROP POLICY IF EXISTS "org_sessions_insert" ON sessions;
CREATE POLICY "org_sessions_insert" ON sessions FOR INSERT
  WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()) AND get_my_role() IN ('manager', 'support_worker', 'admin'));

DROP POLICY IF EXISTS "org_sessions_update" ON sessions;
CREATE POLICY "org_sessions_update" ON sessions FOR UPDATE
  USING (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()) AND get_my_role() IN ('manager', 'support_worker', 'admin'));

DROP POLICY IF EXISTS "org_sessions_delete" ON sessions;
CREATE POLICY "org_sessions_delete" ON sessions FOR DELETE
  USING (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()) AND get_my_role() IN ('manager', 'admin'));

-- Service Charges
DROP POLICY IF EXISTS "org_charges_insert" ON service_charges;
CREATE POLICY "org_charges_insert" ON service_charges FOR INSERT
  WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()) AND get_my_role() IN ('manager', 'support_worker', 'admin'));

DROP POLICY IF EXISTS "org_charges_update" ON service_charges;
CREATE POLICY "org_charges_update" ON service_charges FOR UPDATE
  USING (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()) AND get_my_role() IN ('manager', 'support_worker', 'admin'));

DROP POLICY IF EXISTS "org_charges_delete" ON service_charges;
CREATE POLICY "org_charges_delete" ON service_charges FOR DELETE
  USING (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()) AND get_my_role() IN ('manager', 'admin'));

-- Intake Checklists
DROP POLICY IF EXISTS "org_checklist_insert" ON intake_checklists;
CREATE POLICY "org_checklist_insert" ON intake_checklists FOR INSERT
  WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()) AND get_my_role() IN ('manager', 'support_worker', 'admin'));

DROP POLICY IF EXISTS "org_checklist_update" ON intake_checklists;
CREATE POLICY "org_checklist_update" ON intake_checklists FOR UPDATE
  USING (tenant_id IN (SELECT id FROM tenants WHERE org_id = get_my_org_id()) AND get_my_role() IN ('manager', 'support_worker', 'admin'));
