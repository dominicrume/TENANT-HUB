-- ============================================================
-- Tenant Hub: catch-up bundle, migrations 031-044
-- Paste this whole file into Supabase SQL Editor and click Run.
-- Every statement here is additive and idempotent (CREATE ... IF
-- NOT EXISTS, DROP POLICY IF EXISTS, etc.) -- safe to run even if
-- some of it already partially exists. Nothing here deletes or
-- overwrites existing data.
-- ============================================================


-- ======================== 031_agent_runtime.sql ========================
-- ============================================================
-- 031_agent_runtime.sql — the agent runtime (docs/BUILD_PLAN.md C10)
-- jobs (typed queue with full lifecycle), agent_health (heartbeat per agent),
-- agent_telemetry (structured events the UI reads), and the KYA receipt
-- columns on audit_logs so an agent's write carries what it read, what it
-- refused, and how it ended (H12). Additive; idempotent.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.job_status AS ENUM ('pending','processing','done','failed','dead_letter','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.agent_state AS ENUM ('idle','running','failed','halted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── jobs: one row per unit of agent work, per organisation ──────────────────
CREATE TABLE IF NOT EXISTS public.jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  job_type       TEXT NOT NULL,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status         public.job_status NOT NULL DEFAULT 'pending',
  retry_count    INT NOT NULL DEFAULT 0,
  max_retries    INT NOT NULL DEFAULT 3,
  dedupe_key     TEXT,
  correlation_id TEXT,
  error          TEXT,
  scheduled_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_retry_at  TIMESTAMPTZ,
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Idempotent scheduling: the same dedupe_key cannot be queued twice while live.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_dedupe
  ON public.jobs (org_id, dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS idx_jobs_poll ON public.jobs (status, scheduled_at) WHERE status IN ('pending','failed');
CREATE INDEX IF NOT EXISTS idx_jobs_type_org ON public.jobs (org_id, job_type, status);

DROP TRIGGER IF EXISTS trigger_jobs_updated_at ON public.jobs;
CREATE TRIGGER trigger_jobs_updated_at BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── agent_health: is each agent alive, and when did it last succeed ────────
CREATE TABLE IF NOT EXISTS public.agent_health (
  agent                TEXT PRIMARY KEY,
  state                public.agent_state NOT NULL DEFAULT 'idle',
  last_heartbeat_at    TIMESTAMPTZ,
  last_run_at          TIMESTAMPTZ,
  last_success_at      TIMESTAMPTZ,
  last_error           TEXT,
  consecutive_failures INT NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── agent_telemetry: start / end / refusal / error / heartbeat events ───────
CREATE TABLE IF NOT EXISTS public.agent_telemetry (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID REFERENCES public.organisations(id) ON DELETE CASCADE,
  agent          TEXT NOT NULL,
  event          TEXT NOT NULL CHECK (event IN ('start','end','refusal','error','heartbeat')),
  level          TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('debug','info','warn','error')),
  correlation_id TEXT,
  duration_ms    INT,
  fields         JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_telemetry_recent ON public.agent_telemetry (agent, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_org ON public.agent_telemetry (org_id, created_at DESC);

-- ── audit_logs: the KYA receipt travels with the row ────────────────────────
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS org_id         UUID REFERENCES public.organisations(id),
  ADD COLUMN IF NOT EXISTS agent          TEXT,
  ADD COLUMN IF NOT EXISTS sources_read   JSONB,
  ADD COLUMN IF NOT EXISTS refusals       JSONB,
  ADD COLUMN IF NOT EXISTS outcome        TEXT CHECK (outcome IS NULL OR outcome IN ('proposed','recorded','refused','decided')),
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,
  -- The exact payload the hash was computed over (record_snapshot is the saved row, which may differ).
  ADD COLUMN IF NOT EXISTS payload        JSONB;
CREATE INDEX IF NOT EXISTS idx_audit_org_time ON public.audit_logs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_agent ON public.audit_logs (agent, created_at DESC) WHERE agent IS NOT NULL;

-- ── RLS: staff read; only the runtime writes (service role / worker) ────────
ALTER TABLE public.jobs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_health    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_telemetry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_jobs_read" ON public.jobs;
CREATE POLICY "org_jobs_read" ON public.jobs FOR SELECT
  USING (org_id = get_my_org_id() AND get_my_role() IN ('manager','admin'));

DROP POLICY IF EXISTS "staff_agent_health_read" ON public.agent_health;
CREATE POLICY "staff_agent_health_read" ON public.agent_health FOR SELECT
  USING (auth.uid() IS NOT NULL AND get_my_role() IN ('manager','admin','support_worker'));

DROP POLICY IF EXISTS "org_agent_telemetry_read" ON public.agent_telemetry;
CREATE POLICY "org_agent_telemetry_read" ON public.agent_telemetry FOR SELECT
  USING ((org_id = get_my_org_id() OR org_id IS NULL) AND get_my_role() IN ('manager','admin'));

NOTIFY pgrst, 'reload schema';


-- ======================== 032_rls_request_settings.sql ========================
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


-- ======================== 033_property_spine.sql ========================
-- ============================================================
-- 033_property_spine.sql — homes → rooms → tenancies (BUILD_PLAN C16)
--
-- A tenant is a person; where they live is a tenancy of a unit in a property.
-- Existing tenants rows keep their address/postcode/room_number columns as
-- PROJECTIONS derived from the active tenancy (H3); the backfill below creates
-- the spine from those columns exactly once per organisation.
-- Asset class selects the rule set in code (H13): supported | residential |
-- commercial | mixed. Additive; idempotent.
-- ============================================================

DO $$ BEGIN CREATE TYPE public.asset_class AS ENUM ('supported','residential','commercial','mixed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.unit_class AS ENUM ('supported','residential','commercial'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.unit_status AS ENUM ('occupied','vacant','refurbishment','held'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tenancy_type AS ENUM ('supported_licence','licence','ast','commercial_lease','company_let'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.rent_frequency AS ENUM ('weekly','fortnightly','four_weekly','monthly','quarterly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tenancy_status AS ENUM ('draft','active','ending','ended'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.properties (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  address_line1 TEXT,
  city          TEXT,
  postcode      TEXT,
  asset_class   public.asset_class NOT NULL DEFAULT 'supported',
  floors        INT,
  rebuild_value NUMERIC(12,2),
  acquired_on   DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_properties_org ON public.properties (org_id, name);

CREATE TABLE IF NOT EXISTS public.units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  reference   TEXT NOT NULL,                      -- "Room 4", "Flat 2", "Unit B"
  unit_class  public.unit_class NOT NULL DEFAULT 'supported',
  floor       INT,
  bedrooms    INT,
  status      public.unit_status NOT NULL DEFAULT 'vacant',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, reference)
);
CREATE INDEX IF NOT EXISTS idx_units_property ON public.units (property_id);

CREATE TABLE IF NOT EXISTS public.tenancies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  unit_id        UUID NOT NULL REFERENCES public.units(id),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenancy_type   public.tenancy_type NOT NULL DEFAULT 'supported_licence',
  start_date     DATE,
  end_date       DATE,
  rent_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  rent_frequency public.rent_frequency NOT NULL DEFAULT 'weekly',
  rent_due_day   INT,
  status         public.tenancy_status NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tenancies_tenant ON public.tenancies (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tenancies_unit ON public.tenancies (unit_id, status);
-- One active tenancy per tenant, one active tenancy per unit.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenancies_one_active_per_tenant ON public.tenancies (tenant_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenancies_one_active_per_unit ON public.tenancies (unit_id) WHERE status = 'active';

DROP TRIGGER IF EXISTS trigger_properties_updated_at ON public.properties;
CREATE TRIGGER trigger_properties_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trigger_units_updated_at ON public.units;
CREATE TRIGGER trigger_units_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trigger_tenancies_updated_at ON public.tenancies;
CREATE TRIGGER trigger_tenancies_updated_at BEFORE UPDATE ON public.tenancies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS: staff see and manage the organisation's homes; a tenant sees only where they live ──
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenancies  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_properties_read" ON public.properties;
CREATE POLICY "org_properties_read" ON public.properties FOR SELECT
  USING (org_id = public.get_my_org_id() AND (public.is_staff()
         OR id IN (SELECT u.property_id FROM public.units u JOIN public.tenancies t ON t.unit_id = u.id WHERE t.tenant_id = public.get_my_tenant_id() AND t.status = 'active')));
DROP POLICY IF EXISTS "org_properties_write" ON public.properties;
CREATE POLICY "org_properties_write" ON public.properties FOR ALL
  USING (org_id = public.get_my_org_id() AND public.is_staff()) WITH CHECK (org_id = public.get_my_org_id() AND public.is_staff());

DROP POLICY IF EXISTS "org_units_read" ON public.units;
CREATE POLICY "org_units_read" ON public.units FOR SELECT
  USING (org_id = public.get_my_org_id() AND (public.is_staff()
         OR id IN (SELECT unit_id FROM public.tenancies WHERE tenant_id = public.get_my_tenant_id() AND status = 'active')));
DROP POLICY IF EXISTS "org_units_write" ON public.units;
CREATE POLICY "org_units_write" ON public.units FOR ALL
  USING (org_id = public.get_my_org_id() AND public.is_staff()) WITH CHECK (org_id = public.get_my_org_id() AND public.is_staff());

DROP POLICY IF EXISTS "org_tenancies_read" ON public.tenancies;
CREATE POLICY "org_tenancies_read" ON public.tenancies FOR SELECT
  USING (org_id = public.get_my_org_id() AND tenant_id IN (SELECT public.visible_tenant_ids()));
DROP POLICY IF EXISTS "org_tenancies_write" ON public.tenancies;
CREATE POLICY "org_tenancies_write" ON public.tenancies FOR ALL
  USING (org_id = public.get_my_org_id() AND public.is_staff()) WITH CHECK (org_id = public.get_my_org_id() AND public.is_staff());

-- ── Backfill: once per organisation that has tenants but no homes yet ───────
-- A home per distinct (address, postcode); a room per distinct room_number; an
-- active tenancy per active tenant, rent from the brand's service charge default.
DO $$
DECLARE
  o RECORD; t RECORD; v_property UUID; v_unit UUID; v_rent NUMERIC(10,2);
  n_props INT := 0; n_units INT := 0; n_tenancies INT := 0;
BEGIN
  FOR o IN
    SELECT DISTINCT org_id FROM public.tenants tn
    WHERE org_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.properties p WHERE p.org_id = tn.org_id)
  LOOP
    FOR t IN
      SELECT * FROM public.tenants WHERE org_id = o.org_id ORDER BY created_at
    LOOP
      -- Home
      SELECT id INTO v_property FROM public.properties
       WHERE org_id = o.org_id AND COALESCE(address_line1,'') = COALESCE(t.address,'') AND COALESCE(postcode,'') = COALESCE(t.postcode,'') LIMIT 1;
      IF v_property IS NULL THEN
        INSERT INTO public.properties (org_id, name, address_line1, postcode, asset_class)
        VALUES (o.org_id, COALESCE(NULLIF(t.address,''), 'Home ' || (n_props + 1)), t.address, t.postcode, 'supported')
        RETURNING id INTO v_property;
        n_props := n_props + 1;
      END IF;
      -- Room
      SELECT id INTO v_unit FROM public.units WHERE property_id = v_property AND reference = COALESCE(NULLIF(t.room_number,''), 'Room ?');
      IF v_unit IS NULL THEN
        INSERT INTO public.units (org_id, property_id, reference, unit_class, status)
        VALUES (o.org_id, v_property, COALESCE(NULLIF(t.room_number,''), 'Room ?'), 'supported', (CASE WHEN t.is_active AND NOT COALESCE(t.is_archived, FALSE) THEN 'occupied' ELSE 'vacant' END)::public.unit_status)
        RETURNING id INTO v_unit;
        n_units := n_units + 1;
      END IF;
      -- Tenancy (active tenants only; one active per unit — a shared room keeps the first)
      IF t.is_active AND NOT COALESCE(t.is_archived, FALSE)
         AND NOT EXISTS (SELECT 1 FROM public.tenancies WHERE unit_id = v_unit AND status = 'active') THEN
        SELECT service_charge_default INTO v_rent FROM public.settings WHERE brand::text = t.brand::text LIMIT 1;
        INSERT INTO public.tenancies (org_id, unit_id, tenant_id, tenancy_type, start_date, rent_amount, rent_frequency, status)
        VALUES (o.org_id, v_unit, t.id, 'supported_licence', t.moved_in, COALESCE(v_rent, 0), 'weekly', 'active');
        n_tenancies := n_tenancies + 1;
      END IF;
      v_property := NULL; v_unit := NULL;
    END LOOP;
  END LOOP;
  RAISE NOTICE '033 backfill: % homes, % rooms, % tenancies created', n_props, n_units, n_tenancies;
END $$;

NOTIFY pgrst, 'reload schema';


-- ======================== 034_money_and_arrears.sql ========================
-- ============================================================
-- 034_money_and_arrears.sql — one ledger, FIFO arrears, drafted next steps (BUILD_PLAN C17)
--
-- Tenant Hub already has the ledger: service_charges (what is owed) and
-- rent_payments (what came in). This migration links both to the tenancy,
-- replaces the arrears view with FIFO allocation (the oldest unpaid charge is
-- the oldest one NOT covered by cumulative receipts), and adds the tables the
-- rent agents write to: rent_unmatched (money the bank feed could not match
-- with confidence), arrears_cases / arrears_events (the ladder), documents
-- (every drafted letter and the morning summary, so a person can always read
-- what was, or would have been, sent). Additive; idempotent.
-- ============================================================

ALTER TABLE public.service_charges ADD COLUMN IF NOT EXISTS tenancy_id UUID REFERENCES public.tenancies(id) ON DELETE SET NULL;
ALTER TABLE public.rent_payments  ADD COLUMN IF NOT EXISTS tenancy_id UUID REFERENCES public.tenancies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_charges_tenancy_due ON public.service_charges (tenancy_id, due_date);
CREATE INDEX IF NOT EXISTS idx_payments_tenancy_date ON public.rent_payments (tenancy_id, payment_date DESC);

-- Backfill from the tenant's active tenancy (safe to re-run: only fills NULLs).
UPDATE public.service_charges c SET tenancy_id = t.id
  FROM public.tenancies t WHERE c.tenancy_id IS NULL AND t.tenant_id = c.tenant_id AND t.status = 'active';
UPDATE public.rent_payments p SET tenancy_id = t.id
  FROM public.tenancies t WHERE p.tenancy_id IS NULL AND t.tenant_id = p.tenant_id AND t.status = 'active';

-- ── FIFO arrears per tenant ─────────────────────────────────────────────────
-- balance: charged minus paid (positive = owed). oldest_unpaid: the oldest
-- past-due charge whose cumulative total exceeds everything paid so far, so
-- paying an old week moves the rung down (DECISIONS: carried from Estate Ops).
CREATE OR REPLACE VIEW public.tenancy_arrears WITH (security_invoker = true) AS
WITH paid AS (
  SELECT tenant_id, COALESCE(SUM(amount), 0) AS total FROM public.rent_payments GROUP BY tenant_id
), ch AS (
  SELECT c.tenant_id, c.due_date, c.amount,
         SUM(c.amount) OVER (PARTITION BY c.tenant_id ORDER BY c.due_date, c.id) AS cum
  FROM public.service_charges c
)
SELECT
  tn.id AS tenant_id,
  tn.org_id,
  (SELECT t.id FROM public.tenancies t WHERE t.tenant_id = tn.id AND t.status = 'active' LIMIT 1) AS tenancy_id,
  COALESCE((SELECT SUM(amount) FROM public.service_charges WHERE tenant_id = tn.id), 0) - COALESCE(p.total, 0) AS balance,
  (SELECT MIN(ch.due_date) FROM ch WHERE ch.tenant_id = tn.id AND ch.cum > COALESCE(p.total, 0) + 0.005 AND ch.due_date < CURRENT_DATE) AS oldest_unpaid
FROM public.tenants tn
LEFT JOIN paid p ON p.tenant_id = tn.id;

-- Compatibility: the shape and sign the ledger screens already read (paid − charged; negative = arrears).
CREATE OR REPLACE VIEW public.tenant_arrears_balance WITH (security_invoker = true) AS
SELECT
  a.tenant_id,
  a.org_id,
  COALESCE((SELECT SUM(amount) FROM public.service_charges WHERE tenant_id = a.tenant_id), 0) AS total_charged,
  COALESCE((SELECT SUM(amount) FROM public.rent_payments WHERE tenant_id = a.tenant_id), 0) AS total_paid,
  -a.balance AS balance
FROM public.tenancy_arrears a;

-- ── Money in that could not be matched with confidence ──────────────────────
DO $$ BEGIN CREATE TYPE public.unmatched_status AS ENUM ('pending','confirmed','dismissed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.rent_unmatched (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  tenant_id          UUID REFERENCES public.tenants(id) ON DELETE SET NULL,      -- best guess, may be null
  amount             NUMERIC(10,2) NOT NULL,
  received_on        DATE NOT NULL,
  external_reference TEXT,
  confidence         NUMERIC(3,2) NOT NULL,
  source_adapter     TEXT NOT NULL,
  is_simulated       BOOLEAN NOT NULL,
  status             public.unmatched_status NOT NULL DEFAULT 'pending',
  resolved_by        UUID REFERENCES public.profiles(id),
  resolved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, external_reference)
);
CREATE INDEX IF NOT EXISTS idx_unmatched_pending ON public.rent_unmatched (org_id, status) WHERE status = 'pending';

-- ── The arrears ladder ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.arrears_cases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenancy_id      UUID REFERENCES public.tenancies(id) ON DELETE SET NULL,
  opened_on       DATE NOT NULL DEFAULT CURRENT_DATE,
  stage           TEXT NOT NULL,                       -- rung stage from @tenant-hub/domain (H13)
  balance_at_open NUMERIC(10,2),
  closed_on       DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cases_open ON public.arrears_cases (tenant_id) WHERE closed_on IS NULL;

CREATE TABLE IF NOT EXISTS public.arrears_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  case_id               UUID NOT NULL REFERENCES public.arrears_cases(id) ON DELETE CASCADE,
  stage                 TEXT NOT NULL,
  action                TEXT NOT NULL,
  generated_document_id UUID,                          -- documents.id (FK added below)
  requires_approval     BOOLEAN NOT NULL DEFAULT TRUE, -- H11: everything past the first rung
  approved_by           UUID REFERENCES public.profiles(id),
  approved_at           TIMESTAMPTZ,
  released_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_case_stage ON public.arrears_events (case_id, stage);
CREATE INDEX IF NOT EXISTS idx_events_waiting ON public.arrears_events (org_id) WHERE requires_approval AND released_at IS NULL;

-- ── Documents the system drafted ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,                          -- arrears_<stage>, digest, ...
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  related_table TEXT,
  related_id    UUID,
  tenant_id     UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  is_simulated  BOOLEAN NOT NULL DEFAULT TRUE,          -- true until a live notifier actually sent it (H9)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_org_kind ON public.documents (org_id, kind, created_at DESC);
DO $$ BEGIN
  ALTER TABLE public.arrears_events ADD CONSTRAINT arrears_events_document_fk FOREIGN KEY (generated_document_id) REFERENCES public.documents(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS: staff of the organisation; writes come through writeWithAudit ──────
ALTER TABLE public.rent_unmatched ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arrears_cases  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arrears_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents      ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_unmatched_all" ON public.rent_unmatched;
CREATE POLICY "org_unmatched_all" ON public.rent_unmatched FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());
DROP POLICY IF EXISTS "org_cases_all" ON public.arrears_cases;
CREATE POLICY "org_cases_all" ON public.arrears_cases FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());
DROP POLICY IF EXISTS "org_events_all" ON public.arrears_events;
CREATE POLICY "org_events_all" ON public.arrears_events FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());
DROP POLICY IF EXISTS "org_documents_read" ON public.documents;
CREATE POLICY "org_documents_read" ON public.documents FOR SELECT
  USING (org_id = public.get_my_org_id() AND (public.is_staff() OR tenant_id = public.get_my_tenant_id()));
DROP POLICY IF EXISTS "org_documents_write" ON public.documents;
CREATE POLICY "org_documents_write" ON public.documents FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());

NOTIFY pgrst, 'reload schema';


-- ======================== 035_compliance_insurance.sql ========================
-- ============================================================
-- 035_compliance_insurance.sql — certificates and insurance (BUILD_PLAN C18)
--
-- certificate_types is global (statutory sets per unit class); the required
-- set per property is selected in code (@tenant-hub/domain, H13). certificates
-- are what a home actually holds; compliance_alerts are raised by the
-- compliance-watch agent at 90/60/30/7 days, on expiry, and when a required
-- certificate is missing. Insurance ends at a decision card: cycles reach
-- awaiting_decision and a person decides (H10). Additive; idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.certificate_types (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT NOT NULL UNIQUE,
  default_validity_months  INT NOT NULL,
  applies_to               public.unit_class NOT NULL,
  statutory_reference      TEXT
);
INSERT INTO public.certificate_types (name, default_validity_months, applies_to, statutory_reference) VALUES
  -- supported housing (HMO)
  ('Gas Safety (CP12)',                     12, 'supported',   'Gas Safety (Installation and Use) Regulations 1998'),
  ('EICR',                                  60, 'supported',   'Electrical Safety Standards in the Private Rented Sector 2020 / HMO licence conditions'),
  ('EPC',                                  120, 'supported',   'Energy Performance of Buildings Regulations 2012'),
  ('Fire Risk Assessment',                  12, 'supported',   'Regulatory Reform (Fire Safety) Order 2005'),
  ('Fire alarm & emergency lighting test',  12, 'supported',   'BS 5839 / BS 5266'),
  ('Smoke & CO alarms',                     12, 'supported',   'Smoke and Carbon Monoxide Alarm (England) Regulations 2015'),
  ('Legionella risk assessment',            24, 'supported',   'HSE ACOP L8'),
  ('HMO licence',                           60, 'supported',   'Housing Act 2004 Part 2'),
  ('PAT testing',                           12, 'supported',   'Electricity at Work Regulations 1989'),
  -- residential lets
  ('Gas Safety (CP12) (residential)',       12, 'residential', 'Gas Safety (Installation and Use) Regulations 1998'),
  ('EICR (residential)',                    60, 'residential', 'Electrical Safety Standards in the Private Rented Sector 2020'),
  ('EPC (residential)',                    120, 'residential', 'Energy Performance of Buildings Regulations 2012'),
  ('Smoke & CO alarms (residential)',       12, 'residential', 'Smoke and Carbon Monoxide Alarm (England) Regulations 2015'),
  ('Legionella risk assessment (residential)', 24, 'residential', 'HSE ACOP L8'),
  -- commercial
  ('EPC (commercial)',                     120, 'commercial',  'Energy Performance of Buildings Regulations 2012 / MEES'),
  ('EICR (commercial)',                     60, 'commercial',  'Electricity at Work Regulations 1989'),
  ('Fire Risk Assessment (commercial)',     12, 'commercial',  'Regulatory Reform (Fire Safety) Order 2005'),
  ('Asbestos Register',                     12, 'commercial',  'Control of Asbestos Regulations 2012'),
  ('Legionella risk assessment (commercial)', 24, 'commercial', 'HSE ACOP L8'),
  ('Emergency lighting',                    12, 'commercial',  'BS 5266')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.certificates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  property_id         UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id             UUID REFERENCES public.units(id) ON DELETE SET NULL,
  certificate_type_id UUID NOT NULL REFERENCES public.certificate_types(id),
  issued_on           DATE,
  expires_on          DATE,
  document_url        TEXT,
  created_by          UUID REFERENCES public.profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_certificates_property ON public.certificates (property_id, certificate_type_id, expires_on DESC);

DO $$ BEGIN CREATE TYPE public.alert_kind AS ENUM ('expiring_90','expiring_60','expiring_30','expiring_7','expired','missing'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.compliance_alerts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  property_id      UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  certificate_name TEXT NOT NULL,
  kind             public.alert_kind NOT NULL,
  expires_on       DATE,
  raised_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_open ON public.compliance_alerts (org_id, property_id, certificate_name, kind) WHERE resolved_at IS NULL;

-- ── Insurance ───────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE public.cycle_status AS ENUM ('detected','risk_assembled','quotes_gathered','awaiting_decision','decided','lapsed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.cycle_decision AS ENUM ('accept','decline','defer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.insurance_policies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  property_id       UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  insurer           TEXT,
  policy_reference  TEXT,
  renewal_date      DATE,
  annual_premium    NUMERIC(10,2),
  sum_insured       NUMERIC(12,2),
  excess            NUMERIC(10,2),
  renewal_lead_days INT NOT NULL DEFAULT 21,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.insurance_renewal_cycles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  policy_id     UUID NOT NULL REFERENCES public.insurance_policies(id) ON DELETE CASCADE,
  status        public.cycle_status NOT NULL DEFAULT 'detected',
  prior_premium NUMERIC(10,2),
  best_quote_id UUID,
  decision      public.cycle_decision,
  decided_by    UUID REFERENCES public.profiles(id),
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cycles_status ON public.insurance_renewal_cycles (org_id, status);
CREATE TABLE IF NOT EXISTS public.insurance_quotes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  policy_id      UUID NOT NULL REFERENCES public.insurance_policies(id) ON DELETE CASCADE,
  cycle_id       UUID NOT NULL REFERENCES public.insurance_renewal_cycles(id) ON DELETE CASCADE,
  provider_name  TEXT NOT NULL,
  premium        NUMERIC(10,2) NOT NULL,
  excess         NUMERIC(10,2),
  cover_summary  JSONB,
  source_adapter TEXT NOT NULL,
  is_simulated   BOOLEAN NOT NULL,                     -- H9: never nullable
  retrieved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.certificate_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_alerts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_policies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_renewal_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_quotes         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "certificate_types_read" ON public.certificate_types;
CREATE POLICY "certificate_types_read" ON public.certificate_types FOR SELECT USING (public.current_app_user() IS NOT NULL OR public.get_my_org_id() IS NOT NULL);

-- Certificates: staff manage; a tenant may see the certificates of the home they live in.
DROP POLICY IF EXISTS "org_certificates_read" ON public.certificates;
CREATE POLICY "org_certificates_read" ON public.certificates FOR SELECT
  USING (org_id = public.get_my_org_id() AND (public.is_staff()
         OR property_id IN (SELECT u.property_id FROM public.units u JOIN public.tenancies t ON t.unit_id = u.id WHERE t.tenant_id = public.get_my_tenant_id() AND t.status = 'active')));
DROP POLICY IF EXISTS "org_certificates_write" ON public.certificates;
CREATE POLICY "org_certificates_write" ON public.certificates FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());

DROP POLICY IF EXISTS "org_compliance_alerts_all" ON public.compliance_alerts;
CREATE POLICY "org_compliance_alerts_all" ON public.compliance_alerts FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());
DROP POLICY IF EXISTS "org_insurance_policies_all" ON public.insurance_policies;
CREATE POLICY "org_insurance_policies_all" ON public.insurance_policies FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());
DROP POLICY IF EXISTS "org_insurance_renewal_cycles_all" ON public.insurance_renewal_cycles;
CREATE POLICY "org_insurance_renewal_cycles_all" ON public.insurance_renewal_cycles FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());
DROP POLICY IF EXISTS "org_insurance_quotes_all" ON public.insurance_quotes;
CREATE POLICY "org_insurance_quotes_all" ON public.insurance_quotes FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());

NOTIFY pgrst, 'reload schema';


-- ======================== 036_regulation_repairs.sql ========================
-- ============================================================
-- 036_regulation_repairs.sql — new laws, and repairs that get triaged (BUILD_PLAN C18)
--
-- Regulation: a live feed classified by asset class and mapped to homes;
-- items classified 'unknown' are stored for review, never mapped.
-- Repairs: maintenance_tickets is extended — never duplicated — with where
-- the fault is, how it was reported (including the wall QR), the tenant's own
-- words, the transcript, and the triage result. Trades and dispatch_jobs are
-- new. The status vocabulary is left as the screens read it today; it changes
-- with the Repairs screen rebuild (C33, DECISIONS D19). Additive; idempotent.
-- ============================================================

-- ── Regulation ──────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE public.reg_scope AS ENUM ('supported','residential','commercial','all','unknown'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.impact_status AS ENUM ('new','acknowledged','actioned','not_applicable'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.regulation_sources (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  feed_url       TEXT,
  adapter_key    TEXT NOT NULL,
  last_polled_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.regulation_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  source_id           UUID REFERENCES public.regulation_sources(id) ON DELETE SET NULL,
  external_id         TEXT NOT NULL,
  title               TEXT,
  published_on        DATE,
  url                 TEXT,
  raw_excerpt         TEXT,
  applies_to          public.reg_scope NOT NULL DEFAULT 'unknown',
  category            TEXT,
  summary             TEXT,
  confidence          NUMERIC(3,2),
  classified_by_model TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_reg_items_org_pub ON public.regulation_items (org_id, published_on DESC);
CREATE TABLE IF NOT EXISTS public.regulation_impacts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  regulation_item_id UUID NOT NULL REFERENCES public.regulation_items(id) ON DELETE CASCADE,
  property_id        UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  impact_note        TEXT,
  status             public.impact_status NOT NULL DEFAULT 'new',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (regulation_item_id, property_id)
);

-- ── Repairs: extend the existing tickets table ──────────────────────────────
DO $$ BEGIN CREATE TYPE public.issue_via AS ENUM ('portal','phone','voice','email','inspection','qr','staff'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.issue_severity AS ENUM ('emergency','urgent','routine','cosmetic'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.maintenance_tickets
  ADD COLUMN IF NOT EXISTS property_id      UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_id          UUID REFERENCES public.units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reported_via     public.issue_via NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS raw_report       TEXT,                 -- the reporter's own words
  ADD COLUMN IF NOT EXISTS transcript       TEXT,
  ADD COLUMN IF NOT EXISTS category         TEXT,
  ADD COLUMN IF NOT EXISTS severity         public.issue_severity,
  ADD COLUMN IF NOT EXISTS triage_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS triaged_at       TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_tickets_org_status ON public.maintenance_tickets (org_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_untriaged ON public.maintenance_tickets (org_id) WHERE severity IS NULL;

-- Backfill where the fault is from the tenant's active tenancy (fills NULLs only).
UPDATE public.maintenance_tickets m SET property_id = u.property_id, unit_id = u.id
  FROM public.tenancies t JOIN public.units u ON u.id = t.unit_id
  WHERE m.property_id IS NULL AND m.tenant_id = t.tenant_id AND t.status = 'active';

CREATE TABLE IF NOT EXISTS public.trades (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  category             TEXT NOT NULL,                  -- plumbing, heating, electrical, gas, ...
  contact_email        TEXT,
  contact_phone        TEXT,
  is_emergency_capable BOOLEAN NOT NULL DEFAULT FALSE, -- 24/7: the only kind an emergency may auto-dispatch to
  profile_id           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,  -- when the trade has a contractor login
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.dispatch_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  ticket_id     UUID NOT NULL REFERENCES public.maintenance_tickets(id) ON DELETE CASCADE,
  trade_id      UUID REFERENCES public.trades(id) ON DELETE SET NULL,
  proposed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_at TIMESTAMPTZ,                           -- NULL until a person confirms (or an emergency auto-dispatches)
  dispatched_by UUID REFERENCES public.profiles(id),
  completed_at  TIMESTAMPTZ,
  cost          NUMERIC(10,2)
);
CREATE INDEX IF NOT EXISTS idx_dispatch_ticket ON public.dispatch_jobs (ticket_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.regulation_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulation_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulation_impacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_jobs      ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_regulation_sources_all" ON public.regulation_sources;
CREATE POLICY "org_regulation_sources_all" ON public.regulation_sources FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());
DROP POLICY IF EXISTS "org_regulation_items_all" ON public.regulation_items;
CREATE POLICY "org_regulation_items_all" ON public.regulation_items FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());
DROP POLICY IF EXISTS "org_regulation_impacts_all" ON public.regulation_impacts;
CREATE POLICY "org_regulation_impacts_all" ON public.regulation_impacts FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());
DROP POLICY IF EXISTS "org_trades_all" ON public.trades;
CREATE POLICY "org_trades_all" ON public.trades FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());
-- A contractor sees the jobs dispatched to their trade.
DROP POLICY IF EXISTS "org_dispatch_read" ON public.dispatch_jobs;
CREATE POLICY "org_dispatch_read" ON public.dispatch_jobs FOR SELECT
  USING (org_id = public.get_my_org_id() AND (public.is_staff()
         OR trade_id IN (SELECT id FROM public.trades WHERE profile_id = public.current_app_user())));
DROP POLICY IF EXISTS "org_dispatch_write" ON public.dispatch_jobs;
CREATE POLICY "org_dispatch_write" ON public.dispatch_jobs FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());

NOTIFY pgrst, 'reload schema';


-- ======================== 037_commitments.sql ========================
-- ============================================================
-- 037_commitments.sql — the promises made (BUILD_PLAN C18)
--
-- staff_notes, sessions and communications ARE the interaction record; no
-- parallel table. The interaction-memory agent summarises them and lifts each
-- promise into a row of its own, so "Before your next contact" is a query, not
-- a JSON scan. Additive; idempotent.
-- ============================================================

ALTER TABLE public.staff_notes    ADD COLUMN IF NOT EXISTS summary TEXT, ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'note';
ALTER TABLE public.sessions       ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS summary TEXT;

DO $$ BEGIN CREATE TYPE public.commitment_owner AS ENUM ('landlord','tenant','contractor','support_worker','council'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.commitment_status AS ENUM ('open','done','overdue'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.commitments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  tenant_id    UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL,                         -- staff_notes | sessions | communications
  source_id    UUID NOT NULL,
  text         TEXT NOT NULL,
  owner        public.commitment_owner NOT NULL,
  due_on       DATE,
  status       public.commitment_status NOT NULL DEFAULT 'open',
  done_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_table, source_id, text)               -- re-running memory never duplicates a promise
);
CREATE INDEX IF NOT EXISTS idx_commitments_open ON public.commitments (org_id, tenant_id, due_on) WHERE status <> 'done';

ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_commitments_all" ON public.commitments;
CREATE POLICY "org_commitments_all" ON public.commitments FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());

NOTIFY pgrst, 'reload schema';


-- ======================== 038_roles.sql ========================
-- ============================================================
-- 038_roles.sql — the contractor role (BUILD_PLAN C19)
--
-- A contractor is a trade with a login: one screen, /jobs, showing only the
-- dispatch_jobs assigned to their trade (RLS policy "org_dispatch_read" in
-- 036 already reads this role). Contractors never see tenants, money or
-- settings. Middleware already redirects role='contractor' away from
-- /dashboard and /tenants to /jobs (apps/web/src/middleware.ts); this
-- migration is what makes that role assignable.
-- ============================================================

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'contractor';


-- ======================== 039_rent_reconciliation.sql ========================
-- ============================================================
-- 039_rent_reconciliation.sql — dedupe keys for the rent-reconciliation agent (BUILD_PLAN C22)
--
-- Two gaps the agent would otherwise hit on every scheduled re-run:
--  1. rent_payments has no way to recognise "I already recorded this bank
--     transaction" — a scheduled agent would re-insert the same payment every
--     day it sees the same transaction from the feed. external_reference plus
--     a partial unique index closes it; a manually-entered payment (via the
--     ledger's "Record Payment" button) has no external_reference and is
--     unaffected.
--  2. service_charges has no constraint stopping two charges for the same
--     tenancy landing on the same due date. The agent checks before it
--     inserts, but the index is the belt-and-suspenders backstop the rest of
--     this schema already uses everywhere else (jobs, compliance_alerts,
--     tenancies). Additive; idempotent.
-- ============================================================

ALTER TABLE public.rent_payments ADD COLUMN IF NOT EXISTS external_reference TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rent_payments_external_ref
  ON public.rent_payments (external_reference) WHERE external_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_charges_tenancy_due
  ON public.service_charges (tenancy_id, due_date) WHERE tenancy_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';


-- ======================== 040_own_sessions.sql ========================
-- ============================================================
-- 040_own_sessions.sql — Tenant Hub's own sessions (BUILD_PLAN C31)
--
-- Supabase Auth still exists and still works while this lands — nothing here
-- removes auth.users or the trigger that provisions a profile from it. This
-- adds the tables the app's OWN login needs: a password hash on profiles
-- (scrypt; a bcrypt hash imported from an existing Supabase account is
-- verified once and then overwritten — packages/auth/src/password.ts),
-- opaque session tokens (only their SHA-256 hash is ever stored — the raw
-- token lives in the httpOnly cookie and nowhere else), a login-attempts log
-- for throttling by email+IP without Upstash, and one-time password-reset
-- tokens. pending_invites (029) gets the same token_hash treatment for its
-- accept-invite link. Additive; idempotent.
-- ============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  ip           TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_profile ON public.user_sessions (profile_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON public.user_sessions (expires_at);

-- Every attempt, successful or not — the throttle query reads recent failures
-- by email AND by IP, so one leaked password can't be brute-forced from a
-- single machine, and one IP can't be used to spray many accounts.
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL,
  ip           TEXT NOT NULL,
  succeeded    BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON public.login_attempts (lower(email), attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON public.login_attempts (ip, attempted_at DESC);

CREATE TABLE IF NOT EXISTS public.password_resets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_password_resets_profile ON public.password_resets (profile_id) WHERE consumed_at IS NULL;

ALTER TABLE public.pending_invites ADD COLUMN IF NOT EXISTS token_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_invites_token ON public.pending_invites (token_hash) WHERE token_hash IS NOT NULL;

-- These are read and written only through packages/db (service-role / direct pg,
-- same as every other table this package owns) — never through the Supabase
-- client with a user's own JWT, so there is no "the tenant reads their own
-- session row" case RLS needs to allow. Locking them down is pure defence in
-- depth against a future accidental client-side query.
ALTER TABLE public.user_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_only_user_sessions" ON public.user_sessions;
CREATE POLICY "service_only_user_sessions" ON public.user_sessions FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "service_only_login_attempts" ON public.login_attempts;
CREATE POLICY "service_only_login_attempts" ON public.login_attempts FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "service_only_password_resets" ON public.password_resets;
CREATE POLICY "service_only_password_resets" ON public.password_resets FOR ALL USING (false) WITH CHECK (false);

NOTIFY pgrst, 'reload schema';


-- ======================== 041_profiles_own_identity.sql ========================
-- ============================================================
-- 041_profiles_own_identity.sql — a profile no longer needs a Supabase account (BUILD_PLAN C31)
--
-- profiles.id was a foreign key to auth.users(id), so a person could not exist
-- in Tenant Hub without Supabase Auth having issued them first. The own-session
-- system (040) creates accounts itself from an emailed invite, so that link is
-- dropped and the id gets its own default. Every existing profile keeps its id,
-- and existing rows that came from Supabase Auth are untouched — this only stops
-- REQUIRING the auth.users row. handle_new_user() (001/029) is left in place:
-- it still fires if Supabase Auth ever creates a user, which is exactly what
-- keeps the old login working while both systems coexist. Idempotent.
-- ============================================================

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.profiles'::regclass AND contype = 'f' AND confrelid = 'auth.users'::regclass;
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c); END IF;
END $$;

ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- One live profile per email address, so an invite can never create a second account for someone.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique_idx ON public.profiles (lower(email)) WHERE email IS NOT NULL;

NOTIFY pgrst, 'reload schema';


-- ======================== 042_contractor_trade_read.sql ========================
-- ============================================================
-- 042_contractor_trade_read.sql — a contractor can read their OWN trade row
-- (BUILD_PLAN C33, the contractor /jobs page)
--
-- Bug found while rebuilding /jobs: org_dispatch_read (migration 036) lets a
-- contractor see jobs "trade_id IN (SELECT id FROM trades WHERE profile_id =
-- current_app_user())" — but that subquery runs AS the contractor, and RLS on
-- trades (org_trades_all) requires is_staff(). So the subquery always came
-- back empty for a contractor, and the OR clause was always false: no
-- contractor could ever see a job dispatched to them. Silent — no error, the
-- job list was just always empty. This is the same shape of bug CLAUDE.md's
-- "Problem This Solves" section calls out (a list that quietly comes back
-- wrong), just found here instead of in the old prototype.
--
-- Fix: add one SELECT policy so a contractor can read their own trade row.
-- org_trades_all (staff, full org) is untouched — this only adds a second,
-- narrower way in for the trade's own contractor login. Additive; idempotent.
-- ============================================================

DROP POLICY IF EXISTS "own_trade_read" ON public.trades;
CREATE POLICY "own_trade_read" ON public.trades FOR SELECT
  USING (profile_id = public.current_app_user());

-- Same shape of gap, one table over: maintenance_tickets' own SELECT policy
-- (migration 032) only opens to is_staff() OR the reporting tenant — a
-- contractor embedding the ticket behind their dispatch_jobs row got `null`
-- back for it, RLS silently stripping the very description/room the job
-- list exists to show. A contractor may now also read a ticket that has a
-- job dispatched to their own trade.
DROP POLICY IF EXISTS "contractor_own_ticket_read" ON public.maintenance_tickets;
CREATE POLICY "contractor_own_ticket_read" ON public.maintenance_tickets FOR SELECT
  USING (id IN (
    SELECT dj.ticket_id FROM public.dispatch_jobs dj
    JOIN public.trades t ON t.id = dj.trade_id
    WHERE t.profile_id = public.current_app_user()
  ));

NOTIFY pgrst, 'reload schema';


-- ======================== 043_landlords.sql ========================
-- ============================================================
-- 043_landlords.sql — a real, addable list of landlords (BUILD_PLAN C46,
-- M8 — Properties refinement, docs/PROPERTIES_REFINEMENT.md)
--
-- From the 2026-09-30 client walkthrough: "who owns this property" needs to
-- be a real, growing list a manager can add to from the app — not a fixed
-- 2-value brand enum in the frontend (apps/web/src/contexts/BrandContext.tsx),
-- which is exactly what existed before this. This table is that list.
-- Additive; idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.landlords (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_landlords_org ON public.landlords (org_id, name);
DROP TRIGGER IF EXISTS trigger_landlords_updated_at ON public.landlords;
CREATE TRIGGER trigger_landlords_updated_at BEFORE UPDATE ON public.landlords FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- A property may belong to a landlord. Nullable: existing properties, and any
-- property nobody's got round to assigning yet, stay valid — this is additive,
-- never a forced backfill.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS landlord_id UUID REFERENCES public.landlords(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_properties_landlord ON public.properties (landlord_id);

ALTER TABLE public.landlords ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_landlords_all" ON public.landlords;
CREATE POLICY "org_landlords_all" ON public.landlords FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());

NOTIFY pgrst, 'reload schema';


-- ======================== 044_property_documents.sql ========================
-- ============================================================
-- 044_property_documents.sql — the property's own document bucket, separate
-- from a tenant's (BUILD_PLAN C50/C51, M8 — Properties refinement).
--
-- "documents needs to be for the tenant AND for the property" — two separate
-- things, not one shared pile. `tenant_documents` (014) already exists for
-- the tenant side; this is its property-side twin. One row covers both ways
-- a document lands here: added directly (file_url set immediately, status
-- 'received'), or requested from the landlord first and fulfilled later
-- (file_url starts null, status 'requested', filled in on receipt) — C51.
--
-- Deliberately separate from `certificates` (033/035): that table is the
-- compliance matrix with expiry tracking (Paperwork, compliance-watch) and
-- stays exactly as it is. A document requested and received here (even one
-- named "EPC") does NOT also satisfy the Paperwork matrix — that's still
-- added there, with its issue/expiry dates, same as today. Folding the two
-- together is real design work for later, flagged in
-- docs/PROPERTIES_REFINEMENT.md, not assumed here.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.property_documents (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                     UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  property_id                UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  document_type              TEXT NOT NULL,   -- from the app's dropdown list, or "Other: <label>"
  file_url                   TEXT,            -- storage path; null while only requested, not yet received
  status                     TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('requested', 'received')),
  requested_from_landlord_id UUID REFERENCES public.landlords(id) ON DELETE SET NULL,
  requested_at               TIMESTAMPTZ,
  received_at                TIMESTAMPTZ,
  uploaded_by                TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_property_documents_property ON public.property_documents (property_id);

ALTER TABLE public.property_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_property_documents_all" ON public.property_documents;
CREATE POLICY "org_property_documents_all" ON public.property_documents FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());

-- Storage bucket, same shape as tenant-documents (014): private, any signed-in
-- profile may read/write (the table's own org_id is what actually scopes
-- which rows a request ever sees — the bucket policy is the same broad grant
-- tenant-documents already uses).
INSERT INTO storage.buckets (id, name, public) VALUES ('property-documents', 'property-documents', false) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "Staff can view property documents bucket" ON storage.objects;
CREATE POLICY "Staff can view property documents bucket" ON storage.objects FOR SELECT USING (
  bucket_id = 'property-documents' AND (auth.uid() IN (SELECT id FROM public.profiles))
);
DROP POLICY IF EXISTS "Staff can upload to property documents bucket" ON storage.objects;
CREATE POLICY "Staff can upload to property documents bucket" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'property-documents' AND (auth.uid() IN (SELECT id FROM public.profiles))
);

NOTIFY pgrst, 'reload schema';

