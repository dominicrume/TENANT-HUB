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
