-- ============================================================
-- 032_rls_request_settings.sql — RLS keyed on request settings (BUILD_PLAN C15,
-- docs/PLATFORM_CONSOLIDATION.md step 2)
--
-- Every policy now resolves the caller through three helpers that read the
-- per-request settings packages/db sets inside each transaction:
--   app.current_user   app.current_org   app.current_role   app.current_tenant
-- and fall back to the Supabase JWT (auth.uid()) when the settings are absent.
-- So the same policies protect the Supabase client today and the pg client on
-- Railway tomorrow. When neither is present every helper returns NULL and every
-- policy fails closed.
--
-- Also closes gaps found while rewriting (DECISIONS D18): a tenant-role login
-- could read every tenant, charge and staff note in its organisation.
-- visible_tenant_ids() now returns only the caller's own tenant for that role.
--
-- Roles: the web app connects as a role WITHOUT bypassrls; the worker connects
-- as a role WITH bypassrls (it acts for the organisation, like the old service
-- key). Postgres superusers bypass RLS regardless — production must not use one.
-- ============================================================

-- ── Helpers ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_app_user() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE v text; u uuid;
BEGIN
  v := current_setting('app.current_user', true);
  IF v IS NOT NULL AND v <> '' THEN RETURN v::uuid; END IF;
  BEGIN
    EXECUTE 'SELECT auth.uid()' INTO u;   -- Supabase JWT; absent on Railway
    RETURN u;
  EXCEPTION WHEN undefined_function OR invalid_schema_name THEN
    RETURN NULL;
  END;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_org_id() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v text;
BEGIN
  v := current_setting('app.current_org', true);
  IF v IS NOT NULL AND v <> '' THEN RETURN v::uuid; END IF;
  RETURN (SELECT org_id FROM public.profiles WHERE id = public.current_app_user() LIMIT 1);
END $$;

CREATE OR REPLACE FUNCTION public.get_my_role() RETURNS public.user_role
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v text;
BEGIN
  v := current_setting('app.current_role', true);
  IF v IS NOT NULL AND v <> '' THEN RETURN v::public.user_role; END IF;
  RETURN (SELECT role FROM public.profiles WHERE id = public.current_app_user() LIMIT 1);
END $$;

CREATE OR REPLACE FUNCTION public.get_my_tenant_id() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v text;
BEGIN
  v := current_setting('app.current_tenant', true);
  IF v IS NOT NULL AND v <> '' THEN RETURN v::uuid; END IF;
  RETURN (SELECT tenant_id FROM public.profiles WHERE id = public.current_app_user() LIMIT 1);
END $$;

CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT public.get_my_role() IN ('manager', 'support_worker', 'admin');
$$;

/** The tenant records the caller may see: all of the organisation for staff, only their own for a tenant. */
CREATE OR REPLACE FUNCTION public.visible_tenant_ids() RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.get_my_role() = 'tenant' THEN
    RETURN QUERY SELECT public.get_my_tenant_id() WHERE public.get_my_tenant_id() IS NOT NULL;
  ELSE
    RETURN QUERY SELECT id FROM public.tenants WHERE org_id = public.get_my_org_id() AND public.get_my_org_id() IS NOT NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_assigned_to_tenant(t_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenants WHERE id = t_id AND created_by = public.current_app_user());
$$;

-- ── profiles ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org_profiles_read" ON public.profiles;
CREATE POLICY "org_profiles_read" ON public.profiles FOR SELECT
  USING (id = public.current_app_user() OR (public.is_staff() AND org_id = public.get_my_org_id()));
DROP POLICY IF EXISTS "tenant_update_own_profile" ON public.profiles;
CREATE POLICY "tenant_update_own_profile" ON public.profiles FOR UPDATE
  USING (id = public.current_app_user());

-- ── tenants: a tenant sees only themself ────────────────────────────────────
DROP POLICY IF EXISTS "org_tenants_read" ON public.tenants;
CREATE POLICY "org_tenants_read" ON public.tenants FOR SELECT
  USING (id IN (SELECT public.visible_tenant_ids()));

-- ── tenant-linked tables ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org_sessions_read" ON public.sessions;
CREATE POLICY "org_sessions_read" ON public.sessions FOR SELECT
  USING (public.is_staff() AND tenant_id IN (SELECT public.visible_tenant_ids()));

DROP POLICY IF EXISTS "org_charges_read" ON public.service_charges;
CREATE POLICY "org_charges_read" ON public.service_charges FOR SELECT
  USING (tenant_id IN (SELECT public.visible_tenant_ids()));

DROP POLICY IF EXISTS "org_rent_payments_read" ON public.rent_payments;
CREATE POLICY "org_rent_payments_read" ON public.rent_payments FOR SELECT
  USING (tenant_id IN (SELECT public.visible_tenant_ids()));

DROP POLICY IF EXISTS "org_checklist_read" ON public.intake_checklists;
CREATE POLICY "org_checklist_read" ON public.intake_checklists FOR SELECT
  USING (tenant_id IN (SELECT public.visible_tenant_ids()));

DROP POLICY IF EXISTS "org_audit_read" ON public.audit_logs;
CREATE POLICY "org_audit_read" ON public.audit_logs FOR SELECT
  USING (public.is_staff() AND (
    org_id = public.get_my_org_id()
    OR tenant_id IN (SELECT public.visible_tenant_ids())
    OR user_id IN (SELECT id FROM public.profiles WHERE org_id = public.get_my_org_id())));

DROP POLICY IF EXISTS "org_stamp_read" ON public.stamp_queue;
CREATE POLICY "org_stamp_read" ON public.stamp_queue FOR SELECT
  USING (public.is_staff() AND tenant_id IN (SELECT public.visible_tenant_ids()));

-- ── drafts (owned by the user who started the intake) ───────────────────────
DROP POLICY IF EXISTS "org_draft_insert" ON public.drafts;
CREATE POLICY "org_draft_insert" ON public.drafts FOR INSERT WITH CHECK (created_by = public.current_app_user());
DROP POLICY IF EXISTS "org_draft_update" ON public.drafts;
CREATE POLICY "org_draft_update" ON public.drafts FOR UPDATE USING (created_by = public.current_app_user());
DROP POLICY IF EXISTS "org_draft_delete" ON public.drafts;
CREATE POLICY "org_draft_delete" ON public.drafts FOR DELETE USING (created_by = public.current_app_user());

-- ── organisations ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view their own organisation" ON public.organisations;
CREATE POLICY "Users can view their own organisation" ON public.organisations FOR SELECT
  USING (id = public.get_my_org_id());

-- ── form templates and tenant forms ─────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view org form templates" ON public.form_templates;
CREATE POLICY "Users can view org form templates" ON public.form_templates FOR SELECT
  USING (org_id = public.get_my_org_id());
DROP POLICY IF EXISTS "Managers can insert form templates" ON public.form_templates;
CREATE POLICY "Managers can insert form templates" ON public.form_templates FOR INSERT
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() IN ('manager', 'admin'));
DROP POLICY IF EXISTS "Managers can update form templates" ON public.form_templates;
CREATE POLICY "Managers can update form templates" ON public.form_templates FOR UPDATE
  USING (org_id = public.get_my_org_id() AND public.get_my_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS "Staff can view tenant forms" ON public.tenant_forms;
CREATE POLICY "Staff can view tenant forms" ON public.tenant_forms FOR SELECT
  USING (tenant_id IN (SELECT public.visible_tenant_ids()));
DROP POLICY IF EXISTS "Staff can insert tenant forms" ON public.tenant_forms;
CREATE POLICY "Staff can insert tenant forms" ON public.tenant_forms FOR INSERT
  WITH CHECK (public.is_staff() AND tenant_id IN (SELECT public.visible_tenant_ids()));
DROP POLICY IF EXISTS "Staff can update tenant forms" ON public.tenant_forms;
CREATE POLICY "Staff can update tenant forms" ON public.tenant_forms FOR UPDATE
  USING (public.is_staff() AND tenant_id IN (SELECT public.visible_tenant_ids()));

-- ── maintenance: staff see the organisation's; a tenant sees their own ──────
DROP POLICY IF EXISTS "Staff can view org maintenance" ON public.maintenance_tickets;
CREATE POLICY "Staff can view org maintenance" ON public.maintenance_tickets FOR SELECT
  USING (org_id = public.get_my_org_id() AND (public.is_staff() OR tenant_id = public.get_my_tenant_id()));
DROP POLICY IF EXISTS "Staff can insert maintenance" ON public.maintenance_tickets;
CREATE POLICY "Staff can insert maintenance" ON public.maintenance_tickets FOR INSERT
  WITH CHECK (org_id = public.get_my_org_id() AND (public.is_staff() OR tenant_id = public.get_my_tenant_id()));
DROP POLICY IF EXISTS "Staff can update maintenance" ON public.maintenance_tickets;
CREATE POLICY "Staff can update maintenance" ON public.maintenance_tickets FOR UPDATE
  USING (org_id = public.get_my_org_id() AND public.is_staff());

-- ── tenant documents ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Staff can view tenant docs" ON public.tenant_documents;
CREATE POLICY "Staff can view tenant docs" ON public.tenant_documents FOR SELECT
  USING (public.is_staff() AND tenant_id IN (SELECT public.visible_tenant_ids()));
DROP POLICY IF EXISTS "Staff can insert tenant docs" ON public.tenant_documents;
CREATE POLICY "Staff can insert tenant docs" ON public.tenant_documents FOR INSERT
  WITH CHECK (public.is_staff() AND tenant_id IN (SELECT public.visible_tenant_ids()));
DROP POLICY IF EXISTS "Staff can delete tenant docs" ON public.tenant_documents;
CREATE POLICY "Staff can delete tenant docs" ON public.tenant_documents FOR DELETE
  USING (public.is_staff() AND tenant_id IN (SELECT public.visible_tenant_ids()));

-- ── incidents, handovers, communications log: staff, own organisation ───────
DROP POLICY IF EXISTS "Staff can view org incidents" ON public.incident_reports;
CREATE POLICY "Staff can view org incidents" ON public.incident_reports FOR SELECT USING (public.is_staff() AND org_id = public.get_my_org_id());
DROP POLICY IF EXISTS "Staff can insert incidents" ON public.incident_reports;
CREATE POLICY "Staff can insert incidents" ON public.incident_reports FOR INSERT WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());
DROP POLICY IF EXISTS "Staff can update incidents" ON public.incident_reports;
CREATE POLICY "Staff can update incidents" ON public.incident_reports FOR UPDATE USING (public.is_staff() AND org_id = public.get_my_org_id());

DROP POLICY IF EXISTS "Staff can view org handovers" ON public.shift_handovers;
CREATE POLICY "Staff can view org handovers" ON public.shift_handovers FOR SELECT USING (public.is_staff() AND org_id = public.get_my_org_id());
DROP POLICY IF EXISTS "Staff can insert handovers" ON public.shift_handovers;
CREATE POLICY "Staff can insert handovers" ON public.shift_handovers FOR INSERT WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());
DROP POLICY IF EXISTS "Staff can update handovers" ON public.shift_handovers;
CREATE POLICY "Staff can update handovers" ON public.shift_handovers FOR UPDATE USING (public.is_staff() AND org_id = public.get_my_org_id());

DROP POLICY IF EXISTS "Staff can view org communications" ON public.communications_log;
CREATE POLICY "Staff can view org communications" ON public.communications_log FOR SELECT USING (public.is_staff() AND org_id = public.get_my_org_id());
DROP POLICY IF EXISTS "Staff can insert org communications" ON public.communications_log;
CREATE POLICY "Staff can insert org communications" ON public.communications_log FOR INSERT WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());

-- ── staff notes and messages: staff only (a tenant must never read notes about others) ──
DROP POLICY IF EXISTS "Strict isolation for staff_notes" ON public.staff_notes;
CREATE POLICY "Strict isolation for staff_notes" ON public.staff_notes FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());
DROP POLICY IF EXISTS "Strict isolation for communications" ON public.communications;
CREATE POLICY "Strict isolation for communications" ON public.communications FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());

-- ── goals: scoped to the organisation's tenants (previously role-only) ──────
DROP POLICY IF EXISTS "Staff can view goals" ON public.tenant_goals;
CREATE POLICY "Staff can view goals" ON public.tenant_goals FOR SELECT USING (public.is_staff() AND tenant_id IN (SELECT public.visible_tenant_ids()));
DROP POLICY IF EXISTS "Staff can insert goals" ON public.tenant_goals;
CREATE POLICY "Staff can insert goals" ON public.tenant_goals FOR INSERT WITH CHECK (public.is_staff() AND tenant_id IN (SELECT public.visible_tenant_ids()));
DROP POLICY IF EXISTS "Staff can update goals" ON public.tenant_goals;
CREATE POLICY "Staff can update goals" ON public.tenant_goals FOR UPDATE USING (public.is_staff() AND tenant_id IN (SELECT public.visible_tenant_ids()));
DROP POLICY IF EXISTS "Staff can view goal updates" ON public.tenant_goal_updates;
CREATE POLICY "Staff can view goal updates" ON public.tenant_goal_updates FOR SELECT
  USING (public.is_staff() AND goal_id IN (SELECT id FROM public.tenant_goals WHERE tenant_id IN (SELECT public.visible_tenant_ids())));
DROP POLICY IF EXISTS "Staff can insert goal updates" ON public.tenant_goal_updates;
CREATE POLICY "Staff can insert goal updates" ON public.tenant_goal_updates FOR INSERT
  WITH CHECK (public.is_staff() AND goal_id IN (SELECT id FROM public.tenant_goals WHERE tenant_id IN (SELECT public.visible_tenant_ids())));

-- ── settings: any signed-in caller reads; admins change (no Supabase-only "authenticated" role) ──
DROP POLICY IF EXISTS "settings_read_all" ON public.settings;
CREATE POLICY "settings_read_all" ON public.settings FOR SELECT
  USING (public.current_app_user() IS NOT NULL OR public.get_my_org_id() IS NOT NULL);

-- ── agent runtime (031) ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "staff_agent_health_read" ON public.agent_health;
CREATE POLICY "staff_agent_health_read" ON public.agent_health FOR SELECT USING (public.is_staff());

NOTIFY pgrst, 'reload schema';
