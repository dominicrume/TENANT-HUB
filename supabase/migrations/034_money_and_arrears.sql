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
