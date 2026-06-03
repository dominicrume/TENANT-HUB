-- ============================================================
-- 002_rls.sql — Row Level Security
-- Must stay in parity with packages/auth/src/rbac.ts
-- CI test: every TS permission has a matching policy here
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_charges   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE drafts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE stamp_queue       ENABLE ROW LEVEL SECURITY;

-- Helper: get current user role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: check if support worker is assigned to tenant
CREATE OR REPLACE FUNCTION is_assigned_to_tenant(t_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenants WHERE id = t_id AND created_by = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── Profiles ─────────────────────────────────────────────────
CREATE POLICY "own_profile_read"
  ON profiles FOR SELECT USING (id = auth.uid());

CREATE POLICY "manager_all_profiles"
  ON profiles FOR ALL USING (get_my_role() = 'manager');

-- ── Tenants ──────────────────────────────────────────────────
CREATE POLICY "manager_all_tenants"
  ON tenants FOR ALL USING (get_my_role() = 'manager');

CREATE POLICY "worker_read_all_tenants"
  ON tenants FOR SELECT
  USING (get_my_role() IN ('manager','support_worker'));

CREATE POLICY "worker_create_tenant"
  ON tenants FOR INSERT
  WITH CHECK (get_my_role() IN ('manager','support_worker'));

CREATE POLICY "worker_update_tenant"
  ON tenants FOR UPDATE
  USING (get_my_role() IN ('manager','support_worker'));

CREATE POLICY "tenant_read_own"
  ON tenants FOR SELECT
  USING (get_my_role() = 'tenant' AND created_by = auth.uid());

-- ── Sessions ─────────────────────────────────────────────────
CREATE POLICY "staff_all_sessions"
  ON sessions FOR ALL
  USING (get_my_role() IN ('manager','support_worker'));

-- ── Service Charges ──────────────────────────────────────────
CREATE POLICY "manager_all_charges"
  ON service_charges FOR ALL USING (get_my_role() = 'manager');

CREATE POLICY "worker_read_charges"
  ON service_charges FOR SELECT
  USING (get_my_role() IN ('manager','support_worker'));

-- ── Audit Logs ───────────────────────────────────────────────
CREATE POLICY "manager_read_audit"
  ON audit_logs FOR SELECT USING (get_my_role() = 'manager');

CREATE POLICY "system_insert_audit"
  ON audit_logs FOR INSERT WITH CHECK (true);

-- ── Drafts ───────────────────────────────────────────────────
CREATE POLICY "own_draft"
  ON drafts FOR ALL USING (created_by = auth.uid());

-- ── Stamp Queue ──────────────────────────────────────────────
CREATE POLICY "manager_read_stamps"
  ON stamp_queue FOR SELECT USING (get_my_role() = 'manager');

CREATE POLICY "system_insert_stamps"
  ON stamp_queue FOR INSERT WITH CHECK (true);
