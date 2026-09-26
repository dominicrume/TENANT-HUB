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
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['regulation_sources','regulation_items','regulation_impacts','trades'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "org_%s_all" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "org_%s_all" ON public.%I FOR ALL USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id())', t, t);
  END LOOP;
END $$;
-- A contractor sees the jobs dispatched to their trade.
DROP POLICY IF EXISTS "org_dispatch_read" ON public.dispatch_jobs;
CREATE POLICY "org_dispatch_read" ON public.dispatch_jobs FOR SELECT
  USING (org_id = public.get_my_org_id() AND (public.is_staff()
         OR trade_id IN (SELECT id FROM public.trades WHERE profile_id = public.current_app_user())));
DROP POLICY IF EXISTS "org_dispatch_write" ON public.dispatch_jobs;
CREATE POLICY "org_dispatch_write" ON public.dispatch_jobs FOR ALL
  USING (public.is_staff() AND org_id = public.get_my_org_id()) WITH CHECK (public.is_staff() AND org_id = public.get_my_org_id());

NOTIFY pgrst, 'reload schema';
