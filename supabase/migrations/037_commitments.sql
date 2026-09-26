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
